import json
import os
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import telebot
from telebot import types
from flask import Flask, jsonify, request
from flask_cors import CORS

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8605146619:AAHaaOgLqDxUi62VIRMfQCZ13LLE2NGtRMU")
API_PORT = int(os.getenv("API_PORT", os.getenv("PORT", "3001")))
DB_FILE = Path(os.getenv("AUTH_DB_PATH", str(Path(__file__).with_name("auth.db"))))
LEGACY_JSON_FILE = Path(os.getenv("LEGACY_JSON_PATH", str(Path(__file__).with_name("tokens_db.json"))))
PAY_SUPPORT_CONTACT = os.getenv("PAY_SUPPORT_CONTACT", "").strip()

PLANS = [
    {
        "id": "subscription_30d",
        "callback_data": "buy_subscription_30d",
        "days": 30,
        "stars": 15,
        "title": "Limitless на 30 дней",
        "description": "Доступ Limitless на 30 дней",
        "button_text": "30 дней · 15 stars",
        "subscription_plan": "subscription_30d",
        "permanent": False,
    },
    {
        "id": "subscription_90d",
        "callback_data": "buy_subscription_90d",
        "days": 90,
        "stars": 40,
        "title": "Limitless на 90 дней",
        "description": "Доступ Limitless на 90 дней",
        "button_text": "90 дней · 40 stars",
        "subscription_plan": "subscription_90d",
        "permanent": False,
    },
    {
        "id": "lifetime_access",
        "callback_data": "buy_lifetime_access",
        "days": 0,
        "stars": 100,
        "title": "Limitless навсегда",
        "description": "Постоянный доступ к Limitless",
        "button_text": "Навсегда · 100 stars",
        "subscription_plan": "lifetime",
        "permanent": True,
    },
]
PLANS_BY_ID = {plan["id"]: plan for plan in PLANS}
PLANS_BY_CALLBACK = {plan["callback_data"]: plan for plan in PLANS}

bot = telebot.TeleBot(BOT_TOKEN)
app = Flask(__name__)
CORS(app)

db_lock = threading.Lock()


def parse_admin_chat_ids() -> set[int]:
    admin_ids: set[int] = set()
    raw_value = os.getenv("TELEGRAM_ADMIN_IDS", "")
    for item in raw_value.split(","):
        value = item.strip()
        if not value:
            continue
        try:
            admin_ids.add(int(value))
        except ValueError:
            continue
    return admin_ids


ADMIN_CHAT_IDS = parse_admin_chat_ids()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso_datetime(value: str | None):
    if not value:
        return None

    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def is_subscription_expired(expires_at: str | None) -> bool:
    expires_at_dt = parse_iso_datetime(expires_at)
    if expires_at_dt is None:
        return False
    return expires_at_dt <= datetime.now(timezone.utc)


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_FILE)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_column(connection: sqlite3.Connection, table_name: str, column_name: str, definition: str) -> None:
    columns = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    existing_columns = {column[1] for column in columns}
    if column_name not in existing_columns:
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def init_db() -> None:
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_tokens (
                token TEXT PRIMARY KEY,
                chat_id INTEGER NOT NULL UNIQUE,
                username TEXT NOT NULL,
                created_at TEXT NOT NULL,
                activated_device_id TEXT UNIQUE,
                activated_at TEXT,
                subscription_plan TEXT NOT NULL DEFAULT 'inactive',
                subscription_status TEXT NOT NULL DEFAULT 'inactive',
                subscription_expires_at TEXT,
                revoked_at TEXT,
                last_seen_at TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS star_payments (
                telegram_payment_charge_id TEXT PRIMARY KEY,
                provider_payment_charge_id TEXT,
                chat_id INTEGER NOT NULL,
                token TEXT NOT NULL,
                plan_id TEXT NOT NULL,
                invoice_payload TEXT NOT NULL,
                currency TEXT NOT NULL,
                total_amount INTEGER NOT NULL,
                days INTEGER NOT NULL,
                processed_at TEXT NOT NULL
            )
            """
        )
        ensure_column(connection, "star_payments", "plan_id", "TEXT NOT NULL DEFAULT ''")
        connection.commit()


def migrate_legacy_json() -> None:
    if not LEGACY_JSON_FILE.exists():
        return

    try:
        legacy_data = json.loads(LEGACY_JSON_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return

    if not isinstance(legacy_data, dict):
        return

    with get_connection() as connection:
        existing_count = connection.execute("SELECT COUNT(*) FROM auth_tokens").fetchone()[0]
        if existing_count > 0:
            return

        for token, token_data in legacy_data.items():
            if not isinstance(token_data, dict):
                continue

            connection.execute(
                """
                INSERT OR IGNORE INTO auth_tokens (
                    token,
                    chat_id,
                    username,
                    created_at,
                    activated_device_id,
                    activated_at,
                    subscription_plan,
                    subscription_status,
                    subscription_expires_at,
                    revoked_at,
                    last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    token,
                    int(token_data.get("chatId", 0)),
                    str(token_data.get("username", "User")),
                    str(token_data.get("createdAt", now_iso())),
                    token_data.get("activatedDeviceId"),
                    token_data.get("activatedAt"),
                    str(token_data.get("subscriptionPlan", "inactive")),
                    str(token_data.get("subscriptionStatus", "inactive")),
                    token_data.get("subscriptionExpiresAt"),
                    token_data.get("revokedAt"),
                    token_data.get("lastSeenAt"),
                ),
            )

        connection.commit()


def row_to_token_dict(row: sqlite3.Row | None):
    if row is None:
        return None
    return dict(row)


def generate_token() -> str:
    ts = str(int(time.time() * 1000))
    random_str = uuid.uuid4().hex[:16]
    return f"LMT-{ts}-{random_str}"


def is_admin(user_id: int) -> bool:
    return user_id in ADMIN_CHAT_IDS


def get_token_by_chat_id(connection: sqlite3.Connection, chat_id: int):
    row = connection.execute(
        "SELECT * FROM auth_tokens WHERE chat_id = ? LIMIT 1",
        (chat_id,),
    ).fetchone()
    return row_to_token_dict(row)


def get_token_by_value(connection: sqlite3.Connection, token: str):
    row = connection.execute(
        "SELECT * FROM auth_tokens WHERE token = ? LIMIT 1",
        (token,),
    ).fetchone()
    return row_to_token_dict(row)


def get_token_by_device_id(connection: sqlite3.Connection, device_id: str):
    row = connection.execute(
        """
        SELECT * FROM auth_tokens
        WHERE activated_device_id = ?
        LIMIT 1
        """,
        (device_id,),
    ).fetchone()
    return row_to_token_dict(row)


def get_star_payment_by_charge_id(connection: sqlite3.Connection, charge_id: str):
    row = connection.execute(
        """
        SELECT * FROM star_payments
        WHERE telegram_payment_charge_id = ?
        LIMIT 1
        """,
        (charge_id,),
    ).fetchone()
    if row is None:
        return None
    return dict(row)


def create_token_record(connection: sqlite3.Connection, chat_id: int, username: str) -> dict:
    token = generate_token()
    connection.execute(
        """
        INSERT INTO auth_tokens (
            token,
            chat_id,
            username,
            created_at,
            subscription_plan,
            subscription_status
        ) VALUES (?, ?, ?, ?, 'inactive', 'inactive')
        """,
        (token, chat_id, username, now_iso()),
    )
    return get_token_by_value(connection, token)


def get_or_create_token_record(connection: sqlite3.Connection, chat_id: int, username: str) -> dict:
    token_data = get_token_by_chat_id(connection, chat_id)
    if token_data:
        return token_data
    return create_token_record(connection, chat_id, username)


def format_subscription_status(token_data: dict) -> str:
    if token_data.get("revoked_at"):
        return f"Токен отозван: {token_data['revoked_at']}"

    if token_data.get("subscription_plan") == "lifetime" and token_data.get("subscription_status") == "active":
        return "Доступ: навсегда"

    if token_data.get("subscription_status") != "active":
        return "Подписка: неактивна"

    if token_data.get("subscription_expires_at"):
        return f"Подписка до: {token_data['subscription_expires_at']}"

    return "Подписка: активна"


def build_token_summary(token_data: dict) -> str:
    activation_status = (
        f"Активирован: {token_data.get('activated_at', 'неизвестно')}"
        if token_data.get("activated_device_id")
        else "Еще не активирован"
    )
    return (
        f"<code>{token_data['token']}</code>\n\n"
        f"Создан: {token_data['created_at']}\n"
        f"{activation_status}\n"
        f"{format_subscription_status(token_data)}\n\n"
        "Токен постоянный: после первой покупки он создается один раз и дальше только продлевается."
    )


def calculate_extended_expiry(current_expiry: str | None, days: int) -> str:
    now = datetime.now(timezone.utc)
    current_expiry_dt = parse_iso_datetime(current_expiry)
    if current_expiry_dt is None or current_expiry_dt <= now:
        base_date = now
    else:
        base_date = current_expiry_dt
    return (base_date + timedelta(days=days)).isoformat()


def apply_plan_to_token_record(connection: sqlite3.Connection, token_data: dict, plan: dict) -> dict:
    if plan["permanent"]:
        connection.execute(
            """
            UPDATE auth_tokens
            SET subscription_plan = 'lifetime',
                subscription_status = 'active',
                subscription_expires_at = NULL,
                revoked_at = NULL
            WHERE token = ?
            """,
            (token_data["token"],),
        )
        return get_token_by_value(connection, token_data["token"])

    if token_data.get("subscription_plan") == "lifetime" and token_data.get("subscription_status") == "active":
        return token_data

    new_expiry = calculate_extended_expiry(token_data.get("subscription_expires_at"), int(plan["days"]))
    connection.execute(
        """
        UPDATE auth_tokens
        SET subscription_plan = ?,
            subscription_status = 'active',
            subscription_expires_at = ?,
            revoked_at = NULL
        WHERE token = ?
        """,
        (plan["subscription_plan"], new_expiry, token_data["token"]),
    )
    return get_token_by_value(connection, token_data["token"])


def extend_token_subscription(token: str, days: int):
    with db_lock:
        with get_connection() as connection:
            token_data = get_token_by_value(connection, token)
            if not token_data:
                return None

            if token_data.get("subscription_plan") == "lifetime" and token_data.get("subscription_status") == "active":
                return token_data

            new_expiry = calculate_extended_expiry(token_data.get("subscription_expires_at"), days)
            connection.execute(
                """
                UPDATE auth_tokens
                SET subscription_plan = 'manual_extend',
                    subscription_status = 'active',
                    subscription_expires_at = ?,
                    revoked_at = NULL
                WHERE token = ?
                """,
                (new_expiry, token),
            )
            connection.commit()
            return get_token_by_value(connection, token)


def record_star_payment(
    connection: sqlite3.Connection,
    telegram_payment_charge_id: str,
    provider_payment_charge_id: str,
    chat_id: int,
    token: str,
    plan_id: str,
    invoice_payload: str,
    currency: str,
    total_amount: int,
    days: int,
) -> None:
    connection.execute(
        """
        INSERT INTO star_payments (
            telegram_payment_charge_id,
            provider_payment_charge_id,
            chat_id,
            token,
            plan_id,
            invoice_payload,
            currency,
            total_amount,
            days,
            processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            telegram_payment_charge_id,
            provider_payment_charge_id,
            chat_id,
            token,
            plan_id,
            invoice_payload,
            currency,
            total_amount,
            days,
            now_iso(),
        ),
    )


def build_purchase_keyboard() -> types.InlineKeyboardMarkup:
    keyboard = types.InlineKeyboardMarkup()
    for plan in PLANS:
        keyboard.add(
            types.InlineKeyboardButton(
                text=plan["button_text"],
                callback_data=plan["callback_data"],
            )
        )
    return keyboard


def make_invoice_payload(plan_id: str, chat_id: int) -> str:
    return f"{plan_id}|{chat_id}|{uuid.uuid4().hex[:8]}"


def parse_invoice_payload(invoice_payload: str):
    parts = invoice_payload.split("|")
    if len(parts) < 2:
        return None

    plan = PLANS_BY_ID.get(parts[0])
    if not plan:
        return None

    try:
        expected_chat_id = int(parts[1])
    except ValueError:
        return None

    return {
        "plan": plan,
        "expected_chat_id": expected_chat_id,
    }


def build_plans_message() -> str:
    lines = [
        "<b>Тарифы Limitless</b>",
        "",
        "Токен создается только после первой успешной оплаты и потом остается тем же навсегда.",
        "",
    ]
    for plan in PLANS:
        if plan["permanent"]:
            lines.append(f"• Навсегда — {plan['stars']} stars")
        else:
            lines.append(f"• {plan['days']} дней — {plan['stars']} stars")
    return "\n".join(lines)


def send_subscription_offer(chat_id: int) -> None:
    bot.send_message(
        chat_id,
        build_plans_message(),
        parse_mode="HTML",
        reply_markup=build_purchase_keyboard(),
    )


def send_subscription_invoice(chat_id: int, plan: dict) -> None:
    bot.send_invoice(
        chat_id=chat_id,
        title=plan["title"],
        description=plan["description"],
        invoice_payload=make_invoice_payload(plan["id"], chat_id),
        provider_token="",
        currency="XTR",
        prices=[types.LabeledPrice(label=plan["description"], amount=int(plan["stars"]))],
        start_parameter=f"limitless-{plan['id']}",
    )


def build_support_message() -> str:
    if PAY_SUPPORT_CONTACT:
        return (
            "По вопросам оплаты и подписки напишите в поддержку: "
            f"{PAY_SUPPORT_CONTACT}\n"
            "Telegram Support и Bot Support не обрабатывают покупки внутри этого бота."
        )
    return (
        "По вопросам оплаты напишите владельцу этого бота или в ваш основной канал поддержки.\n"
        "Telegram Support и Bot Support не обрабатывают покупки внутри этого бота."
    )


def activate_token(token: str, device_id: str) -> dict:
    token = token.strip()
    device_id = device_id.strip()

    if not token or not device_id:
        return {"valid": False, "error": "INVALID_REQUEST"}

    with db_lock:
        with get_connection() as connection:
            token_data = get_token_by_value(connection, token)
            if not token_data:
                return {"valid": False, "error": "TOKEN_NOT_FOUND"}

            if token_data.get("revoked_at"):
                return {"valid": False, "error": "TOKEN_REVOKED"}

            if token_data.get("subscription_status") != "active":
                return {"valid": False, "error": "SUBSCRIPTION_INACTIVE"}

            if is_subscription_expired(token_data.get("subscription_expires_at")):
                return {"valid": False, "error": "SUBSCRIPTION_EXPIRED"}

            bound_token = get_token_by_device_id(connection, device_id)
            if bound_token and bound_token["token"] != token:
                return {"valid": False, "error": "DEVICE_ALREADY_BOUND"}

            activated_device_id = token_data.get("activated_device_id")
            if activated_device_id and activated_device_id != device_id:
                return {"valid": False, "error": "TOKEN_ALREADY_BOUND"}

            if not activated_device_id:
                connection.execute(
                    """
                    UPDATE auth_tokens
                    SET activated_device_id = ?, activated_at = ?, last_seen_at = ?
                    WHERE token = ?
                    """,
                    (device_id, now_iso(), now_iso(), token),
                )
            else:
                connection.execute(
                    "UPDATE auth_tokens SET last_seen_at = ? WHERE token = ?",
                    (now_iso(), token),
                )

            connection.commit()

            return {
                "valid": True,
                "username": token_data.get("username"),
                "error": None,
            }


@bot.message_handler(commands=["start", "help"])
def send_welcome(message):
    username = message.from_user.username or message.from_user.first_name or "User"
    text = (
        f"<b>Limitless Auth Bot</b>\n\n"
        f"Привет, {username}!\n\n"
        "У пользователя нет токена до первой покупки.\n"
        "После первой успешной оплаты бот создает один постоянный токен, который потом только продлевается.\n\n"
        "Команды:\n"
        "/buy - открыть тарифы и оплату через Telegram Stars\n"
        "/token - показать токен, если он уже создан\n"
        "/mytoken - показать токен и статус доступа\n"
        "/paysupport - контакты по оплате\n"
        "/help - эта справка\n"
    )
    if is_admin(message.from_user.id):
        text += "\n/admin: /extend <token> <days> - вручную продлить существующий токен"
    bot.send_message(message.chat.id, text, parse_mode="HTML", reply_markup=build_purchase_keyboard())


@bot.message_handler(commands=["buy", "plans"])
def handle_buy(message):
    send_subscription_offer(message.chat.id)


@bot.message_handler(commands=["token", "mytoken"])
def handle_token(message):
    chat_id = message.chat.id

    with db_lock:
        with get_connection() as connection:
            token_data = get_token_by_chat_id(connection, chat_id)

    if not token_data:
        bot.send_message(
            chat_id,
            (
                "<b>Токена пока нет</b>\n\n"
                "Токен создается только после первой успешной оплаты.\n"
                "Выберите тариф ниже."
            ),
            parse_mode="HTML",
            reply_markup=build_purchase_keyboard(),
        )
        return

    bot.send_message(
        chat_id,
        f"<b>Ваш основной токен:</b>\n\n{build_token_summary(token_data)}",
        parse_mode="HTML",
        reply_markup=build_purchase_keyboard(),
    )


@bot.message_handler(commands=["paysupport", "support"])
def handle_pay_support(message):
    bot.send_message(message.chat.id, build_support_message())


@bot.message_handler(commands=["revoke"])
def handle_revoke(message):
    bot.send_message(
        message.chat.id,
        "Замена и отзыв токена отключены. Токен создается один раз после покупки и затем только продлевается.",
    )


@bot.message_handler(commands=["extend"])
def handle_extend(message):
    chat_id = message.chat.id
    if not is_admin(message.from_user.id):
        bot.send_message(chat_id, "Эта команда доступна только администратору.")
        return

    parts = message.text.split()
    if len(parts) != 3:
        bot.send_message(chat_id, "Использование: /extend <token> <days>")
        return

    token = parts[1].strip()
    try:
        days = int(parts[2])
    except ValueError:
        bot.send_message(chat_id, "Количество дней должно быть целым числом.")
        return

    if days <= 0:
        bot.send_message(chat_id, "Количество дней должно быть больше нуля.")
        return

    updated_token = extend_token_subscription(token, days)
    if not updated_token:
        bot.send_message(chat_id, "Токен не найден.")
        return

    bot.send_message(
        chat_id,
        (
            "<b>Подписка продлена</b>\n\n"
            f"<code>{updated_token['token']}</code>\n\n"
            f"{format_subscription_status(updated_token)}"
        ),
        parse_mode="HTML",
    )


@bot.callback_query_handler(func=lambda call: call.data in PLANS_BY_CALLBACK)
def handle_buy_callback(call):
    plan = PLANS_BY_CALLBACK[call.data]
    try:
        send_subscription_invoice(call.message.chat.id, plan)
        bot.answer_callback_query(call.id)
    except Exception:
        bot.answer_callback_query(call.id, "Не удалось открыть оплату. Попробуйте позже.")


@bot.pre_checkout_query_handler(func=lambda query: True)
def handle_pre_checkout_query(pre_checkout_query):
    parsed_payload = parse_invoice_payload(pre_checkout_query.invoice_payload)
    if not parsed_payload:
        bot.answer_pre_checkout_query(
            pre_checkout_query.id,
            ok=False,
            error_message="Не удалось определить тариф оплаты.",
        )
        return

    plan = parsed_payload["plan"]
    if parsed_payload["expected_chat_id"] != pre_checkout_query.from_user.id:
        bot.answer_pre_checkout_query(
            pre_checkout_query.id,
            ok=False,
            error_message="Этот счет привязан к другому пользователю.",
        )
        return

    if pre_checkout_query.currency != "XTR":
        bot.answer_pre_checkout_query(
            pre_checkout_query.id,
            ok=False,
            error_message="Для этой покупки используются только Telegram Stars.",
        )
        return

    if int(pre_checkout_query.total_amount) != int(plan["stars"]):
        bot.answer_pre_checkout_query(
            pre_checkout_query.id,
            ok=False,
            error_message="Сумма оплаты не совпадает с тарифом.",
        )
        return

    bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)


@bot.message_handler(content_types=["successful_payment"])
def handle_successful_payment(message):
    payment = message.successful_payment
    parsed_payload = parse_invoice_payload(payment.invoice_payload)
    if not parsed_payload:
        bot.send_message(
            message.chat.id,
            "Оплата получена, но тариф не удалось распознать. Напишите в поддержку.",
        )
        return

    plan = parsed_payload["plan"]
    charge_id = payment.telegram_payment_charge_id
    username = message.from_user.username or message.from_user.first_name or "User"

    with db_lock:
        with get_connection() as connection:
            existing_payment = get_star_payment_by_charge_id(connection, charge_id)
            if existing_payment:
                token_data = get_token_by_value(connection, existing_payment["token"])
                connection.commit()
                if token_data:
                    bot.send_message(
                        message.chat.id,
                        (
                            "<b>Эта оплата уже была обработана</b>\n\n"
                            f"{format_subscription_status(token_data)}"
                        ),
                        parse_mode="HTML",
                    )
                return

            token_data = get_or_create_token_record(connection, message.chat.id, username)
            updated_token = apply_plan_to_token_record(connection, token_data, plan)
            record_star_payment(
                connection=connection,
                telegram_payment_charge_id=payment.telegram_payment_charge_id,
                provider_payment_charge_id=payment.provider_payment_charge_id,
                chat_id=message.chat.id,
                token=updated_token["token"],
                plan_id=plan["id"],
                invoice_payload=payment.invoice_payload,
                currency=payment.currency,
                total_amount=int(payment.total_amount),
                days=int(plan["days"]),
            )
            connection.commit()

    access_line = "Доступ: навсегда" if plan["permanent"] else f"Продлено на: {plan['days']} дней"
    bot.send_message(
        message.chat.id,
        (
            "<b>Оплата прошла успешно</b>\n\n"
            f"Ваш токен: <code>{updated_token['token']}</code>\n"
            f"{access_line}\n"
            f"{format_subscription_status(updated_token)}"
        ),
        parse_mode="HTML",
    )


@app.route("/api/validate", methods=["POST"])
def validate_token_post():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"valid": False, "error": "INVALID_REQUEST"})

    token = str(data.get("token", "")).strip()
    device_id = str(data.get("deviceId", "")).strip()
    return jsonify(activate_token(token, device_id))


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


def run_flask():
    app.run(host="0.0.0.0", port=API_PORT, debug=False, use_reloader=False)


if __name__ == "__main__":
    init_db()
    migrate_legacy_json()

    print(f"Limitless Token API started on port {API_PORT}")
    print("Bot started! Polling Telegram API...")

    api_thread = threading.Thread(target=run_flask)
    api_thread.daemon = True
    api_thread.start()

    bot.infinity_polling()
