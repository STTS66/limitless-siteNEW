import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, MotionValue, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { AccountProfile } from '../types';
import { getApiUrl } from '../utils/api';
import { saveAdminAuthToken } from '../utils/storage';
import './LandingPage.css';

interface LandingPageProps {
  onOpenAuth: () => void;
  onOpenAdmin?: () => void;
  onOpenProfile?: () => void;
  navActionLabel?: string;
  primaryActionLabel?: string;
  isAuthenticated?: boolean;
  profile?: AccountProfile | null;
}

interface DockNavItemProps {
  label: string;
  title?: string;
  onClick: () => void;
  mouseX: MotionValue<number>;
  className?: string;
}

const DockNavItem: React.FC<DockNavItemProps> = ({ label, title, onClick, mouseX, className = '' }) => {
  const itemRef = useRef<HTMLButtonElement | null>(null);

  const distance = useTransform(mouseX, (value) => {
    const bounds = itemRef.current?.getBoundingClientRect();
    if (!bounds || !Number.isFinite(value)) {
      return 999;
    }

    return value - (bounds.left + bounds.width / 2);
  });

  const scale = useSpring(
    useTransform(distance, [-180, -90, 0, 90, 180], [1, 1.04, 1.16, 1.04, 1]),
    { stiffness: 320, damping: 24, mass: 0.18 },
  );
  const y = useSpring(
    useTransform(distance, [-180, -90, 0, 90, 180], [0, -2, -8, -2, 0]),
    { stiffness: 320, damping: 24, mass: 0.18 },
  );

  return (
    <motion.button
      ref={itemRef}
      type="button"
      className={`landing-nav-link landing-nav-link-dock ${className}`.trim()}
      onClick={onClick}
      title={title}
      style={{ scale, y }}
    >
      {label}
    </motion.button>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onOpenAdmin,
  onOpenProfile,
  navActionLabel = 'Р’РѕР№С‚Рё',
  primaryActionLabel = 'Р’РѕР№С‚Рё РїРѕ С‚РѕРєРµРЅСѓ',
  isAuthenticated = false,
  profile = null,
}) => {
  const supportBotUrl = 'https://t.me/LimitlessSupport_bot';
  const agreementUrl = '/terms';
  const [terminalPassword, setTerminalPassword] = useState('');
  const [terminalMessage, setTerminalMessage] = useState('');
  const [terminalMessageType, setTerminalMessageType] = useState<'idle' | 'error' | 'success'>('idle');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isCompactNav, setIsCompactNav] = useState(() => window.innerWidth <= 900);
  const navCapsuleRef = useRef<HTMLElement | null>(null);
  const navMouseX = useMotionValue(Number.NEGATIVE_INFINITY);

  const terminalLines = [
    { kind: 'muted', text: 'limitless@node:~$ status' },
    { kind: 'success', text: 'prompt profile: limitless-1.5' },
    { kind: 'success', text: 'model route: gpt-5.2-chat-latest' },
    { kind: 'muted', text: 'limitless@node:~$ runtime --check cache' },
    { kind: 'success', text: 'cache synced successfully' },
    { kind: 'muted', text: 'limitless@node:~$ support --open telegram' },
    { kind: 'accent', text: 'channel: @LimitlessSupport_bot' },
  ];

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const openSupportBot = () => {
    window.open(supportBotUrl, '_blank', 'noopener,noreferrer');
  };

  const openAgreement = () => {
    window.location.href = agreementUrl;
  };

  const navItems = useMemo(
    () => [
      {
        key: 'agreement',
        label: 'РЎРѕРіР»Р°С€РµРЅРёРµ',
        title: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРѕРµ СЃРѕРіР»Р°С€РµРЅРёРµ',
        onClick: () => {
          setMobileNavOpen(false);
          openAgreement();
        },
      },
      {
        key: 'home',
        label: 'Р“Р»Р°РІРЅР°СЏ',
        onClick: () => {
          setMobileNavOpen(false);
          scrollToSection('home');
        },
      },
      {
        key: 'about',
        label: 'Рћ РЅР°СЃ',
        onClick: () => {
          setMobileNavOpen(false);
          scrollToSection('about');
        },
      },
      {
        key: 'support',
        label: 'РџРѕРґРґРµСЂР¶РєР°',
        onClick: () => {
          setMobileNavOpen(false);
          openSupportBot();
        },
      },
      ...(isAuthenticated && profile && onOpenProfile
        ? [
            {
              key: 'profile',
              label: 'РџСЂРѕС„РёР»СЊ',
              className: 'landing-nav-link-mobile-only',
              onClick: () => {
                setMobileNavOpen(false);
                onOpenProfile();
              },
            },
          ]
        : []),
    ],
    [isAuthenticated, onOpenProfile, profile],
  );

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!navCapsuleRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !navCapsuleRef.current.contains(target)) {
        setMobileNavOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const handleResize = () => setIsCompactNav(window.innerWidth <= 900);

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleTerminalLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!terminalPassword.trim()) {
      setTerminalMessage('command required.');
      setTerminalMessageType('error');
      return;
    }

    setIsUnlocking(true);
    setTerminalMessage('');
    setTerminalMessageType('idle');

    try {
      const response = await fetch(getApiUrl('/api/admin/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'admin',
          password: terminalPassword.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.token) {
        throw new Error('Access denied');
      }

      saveAdminAuthToken(data.token);
      setTerminalPassword('');
      setTerminalMessage('session accepted.');
      setTerminalMessageType('success');
      onOpenAdmin?.();
    } catch {
      setTerminalMessage('command rejected.');
      setTerminalMessageType('error');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="landing-page">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      <div className="landing-nav-shell">
        <nav ref={navCapsuleRef} className="landing-nav-capsule">
          <div className="landing-brand">
            <img className="landing-brand-icon" src="/limitless-icon.svg" alt="Limitless icon" />
            <span className="landing-brand-text">LIMITLESS</span>
          </div>

          <button
            type="button"
            className={`landing-mobile-menu-btn${mobileNavOpen ? ' landing-mobile-menu-btn-open' : ''}`}
            onClick={() => setMobileNavOpen((current) => !current)}
            aria-label="РћС‚РєСЂС‹С‚СЊ СЂР°Р·РґРµР»С‹"
            aria-expanded={mobileNavOpen}
          >
            <span />
            <span />
            <span />
          </button>

          <div
            className={`landing-nav-links${mobileNavOpen ? ' landing-nav-links-open' : ''}${isCompactNav ? '' : ' landing-nav-links-dock'}`}
            onMouseMove={isCompactNav ? undefined : (event) => navMouseX.set(event.clientX)}
            onMouseLeave={isCompactNav ? undefined : () => navMouseX.set(Number.NEGATIVE_INFINITY)}
          >
            {navItems.map((item) =>
              isCompactNav ? (
                <button
                  key={item.key}
                  type="button"
                  className={`landing-nav-link${item.className ? ` ${item.className}` : ''}`}
                  onClick={item.onClick}
                  title={item.title}
                >
                  {item.label}
                </button>
              ) : (
                <DockNavItem
                  key={item.key}
                  label={item.label}
                  title={item.title}
                  onClick={item.onClick}
                  mouseX={navMouseX}
                  className={item.className}
                />
              ),
            )}
          </div>

          {isAuthenticated && profile ? (
            <button type="button" className="landing-profile-chip landing-profile-chip-button" aria-label="РћС‚РєСЂС‹С‚СЊ РїСЂРѕС„РёР»СЊ" onClick={onOpenProfile}>
              <ProfileAvatar
                className="landing-profile-avatar"
                nickname={profile.nickname}
                avatarDataUrl={profile.avatarDataUrl}
                avatarHue={profile.avatarHue}
                fallback="silhouette"
              />
              <div className="landing-profile-copy">
                <span className="landing-profile-name">{profile.nickname}</span>
                <span className="landing-profile-meta">{profile.profileId}</span>
              </div>
            </button>
          ) : (
            <button type="button" className="landing-login-btn" onClick={onOpenAuth}>
              {navActionLabel}
            </button>
          )}
        </nav>
      </div>

      <main className="landing-content">
        <section id="home" className="landing-hero">
          <div className="landing-hero-grid">
            <div className="landing-hero-copy">
              <div className="landing-hero-badge">AI Mode</div>
              <h1 className="landing-title">Limitless - РіРѕС‚РѕРІС‹Р№ РР-СЂРµР¶РёРј РґР»СЏ Р±С‹СЃС‚СЂС‹С… Рё Р±РѕР»РµРµ РїСЂСЏРјС‹С… РѕС‚РІРµС‚РѕРІ</h1>
              <p className="landing-description">
                Limitless - СЌС‚Рѕ РїСЂРµРґРЅР°СЃС‚СЂРѕРµРЅРЅС‹Р№ СЂРµР¶РёРј СЂР°Р±РѕС‚С‹ РР РґР»СЏ С‚РµС…, РєС‚Рѕ С…РѕС‡РµС‚ РїРѕР»СѓС‡РёС‚СЊ Р±РѕР»РµРµ СЃРѕР±СЂР°РЅРЅС‹Р№ СЃС‚РёР»СЊ РѕС‚РІРµС‚Р° Р±РµР· РґРѕР»РіРѕР№ СЂСѓС‡РЅРѕР№
                РЅР°СЃС‚СЂРѕР№РєРё. РљСѓРїРёР»Рё РґРѕСЃС‚СѓРї, Р°РєС‚РёРІРёСЂРѕРІР°Р»Рё С‚РѕРєРµРЅ Рё СЃСЂР°Р·Сѓ СЂР°Р±РѕС‚Р°РµС‚Рµ РІ РїСЂРёРІС‹С‡РЅРѕРј РёРЅС‚РµСЂС„РµР№СЃРµ.
              </p>

              <div className="landing-section-buttons">
                <button type="button" className="landing-pill-btn" onClick={openAgreement}>
                  РЎРѕРіР»Р°С€РµРЅРёРµ
                </button>
                <button type="button" className="landing-pill-btn" onClick={() => scrollToSection('home')}>
                  Р“Р»Р°РІРЅР°СЏ
                </button>
                <button type="button" className="landing-pill-btn" onClick={() => scrollToSection('about')}>
                  Рћ РЅР°СЃ
                </button>
                <button type="button" className="landing-pill-btn" onClick={openSupportBot}>
                  РџРѕРґРґРµСЂР¶РєР°
                </button>
              </div>

              <div className="landing-cta-row">
                <button type="button" className="landing-primary-btn" onClick={onOpenAuth}>
                  {primaryActionLabel}
                </button>
                <a
                  className="landing-secondary-btn"
                  href="https://t.me/LimitlesspromtShop_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  РљСѓРїРёС‚СЊ РґРѕСЃС‚СѓРї РІ Telegram
                </a>
              </div>
            </div>

            <div className="landing-terminal-shell" aria-label="Limitless terminal access">
              <div className="landing-terminal-window">
                <div className="landing-terminal-toolbar">
                  <div className="landing-terminal-dots">
                    <span className="landing-terminal-dot terminal-dot-red" />
                    <span className="landing-terminal-dot terminal-dot-yellow" />
                    <span className="landing-terminal-dot terminal-dot-green" />
                  </div>
                  <span className="landing-terminal-title">limitless@node: /runtime/console</span>
                  <span className="landing-terminal-chip">live session</span>
                </div>

                <div className="landing-terminal-body">
                  <div className="landing-terminal-prompt">
                    <span className="landing-terminal-user">limitless@node</span>
                    <span className="landing-terminal-separator">:</span>
                    <span className="landing-terminal-path">~/access</span>
                    <span className="landing-terminal-symbol">$</span>
                    <span className="landing-terminal-command">boot --profile limitless</span>
                  </div>

                  <div className="landing-terminal-output">
                    {terminalLines.map((line, index) => (
                      <div
                        key={`${line.text}-${index}`}
                        className={`landing-terminal-line landing-terminal-line-${line.kind}`}
                        style={{ animationDelay: `${0.18 + index * 0.08}s` }}
                      >
                        {line.text}
                      </div>
                    ))}
                  </div>

                  <form className="landing-terminal-form" onSubmit={handleTerminalLogin}>
                    <label className="landing-terminal-input-row" htmlFor="landing-terminal-password">
                      <span className="landing-terminal-input-prefix">
                        <span className="landing-terminal-user">limitless@node</span>
                        <span className="landing-terminal-separator">:</span>
                        <span className="landing-terminal-path">~/session</span>
                        <span className="landing-terminal-symbol">$</span>
                      </span>
                      <input
                        id="landing-terminal-password"
                        className="landing-terminal-input"
                        type="password"
                        value={terminalPassword}
                        onChange={(e) => setTerminalPassword(e.target.value)}
                        placeholder="type command..."
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Terminal input"
                      />
                    </label>

                    <div className="landing-terminal-actions" aria-live="polite">
                      {isUnlocking ? (
                        <span className="landing-terminal-feedback">processing...</span>
                      ) : (
                        terminalMessage && (
                          <span className={`landing-terminal-feedback landing-terminal-feedback-${terminalMessageType}`}>
                            {terminalMessage}
                          </span>
                        )
                      )}
                    </div>
                  </form>

                  <div className="landing-terminal-footer">
                    <span className="landing-terminal-status">node synced</span>
                    <span className="landing-terminal-cursor" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="landing-section">
          <div className="landing-section-heading">
            <span className="landing-section-kicker">Рћ РЅР°СЃ</span>
            <h2>Р§С‚Рѕ С‚Р°РєРѕРµ Limitless Рё РєР°Рє СѓСЃС‚СЂРѕРµРЅ РґРѕСЃС‚СѓРї</h2>
          </div>

          <div className="landing-grid">
            <article className="landing-card">
              <h3>Р”СЂСѓРіРѕР№ СЃС‚РёР»СЊ РѕС‚РІРµС‚РѕРІ</h3>
              <p>
                Limitless РјРµРЅСЏРµС‚ РїРѕРґР°С‡Сѓ: РѕС‚РІРµС‚С‹ РѕС‰СѓС‰Р°СЋС‚СЃСЏ Р±РѕР»РµРµ Р±С‹СЃС‚СЂС‹РјРё, РїСЂСЏРјС‹РјРё Рё С†РµР»СЊРЅС‹РјРё. Р­С‚Рѕ РЅРµ РѕС‚РґРµР»СЊРЅР°СЏ РјРѕРґРµР»СЊ, Р° РіРѕС‚РѕРІС‹Р№ СЂРµР¶РёРј
                СЂР°Р±РѕС‚С‹ РїРѕРІРµСЂС… OpenAI-СЃРѕРІРјРµСЃС‚РёРјРѕРіРѕ API.
              </p>
            </article>

            <article className="landing-card">
              <h3>РћРґРёРЅ РґРѕСЃС‚СѓРї Р±РµР· РїСѓС‚Р°РЅРёС†С‹</h3>
              <p>РџРѕСЃР»Рµ РїРѕРєСѓРїРєРё Сѓ РІР°СЃ РїРѕСЏРІР»СЏРµС‚СЃСЏ РѕРґРёРЅ РѕСЃРЅРѕРІРЅРѕР№ С‚РѕРєРµРЅ. РћРЅ Р·Р°РєСЂРµРїР»СЏРµС‚СЃСЏ Р·Р° РІР°С€РёРј РґРѕСЃС‚СѓРїРѕРј Рё РґР°Р»СЊС€Рµ С‚РѕР»СЊРєРѕ РїСЂРѕРґР»РµРІР°РµС‚СЃСЏ.</p>
            </article>

            <article className="landing-card">
              <h3>Р—Р°РїСѓСЃРє Р·Р° РїР°СЂСѓ РјРёРЅСѓС‚</h3>
              <p>РќРµ РЅСѓР¶РЅРѕ СЃРѕР±РёСЂР°С‚СЊ СЃР»РѕР¶РЅС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё РІСЂСѓС‡РЅСѓСЋ: РѕС‚РєСЂС‹РІР°РµС‚Рµ СЃР°Р№С‚, РІРІРѕРґРёС‚Рµ С‚РѕРєРµРЅ Рё СЂР°Р±РѕС‚Р°РµС‚Рµ РІ СѓР¶Рµ РіРѕС‚РѕРІРѕРј СЂРµР¶РёРјРµ.</p>
            </article>
          </div>
        </section>

        <section id="support" className="landing-section">
          <div className="landing-section-heading">
            <span className="landing-section-kicker">РџРѕРґРґРµСЂР¶РєР°</span>
            <h2>РџРѕРґРґРµСЂР¶РєР° РїРѕ РґРѕСЃС‚СѓРїСѓ, РѕРїР»Р°С‚Рµ Рё Р·Р°РїСѓСЃРєСѓ</h2>
          </div>

          <div className="landing-grid">
            <article className="landing-card">
              <h3>РџРѕРјРѕС‰СЊ СЃ Р°РєС‚РёРІР°С†РёРµР№</h3>
              <p>Р•СЃР»Рё С‚РѕРєРµРЅ РЅРµ РїСЂРёС€РµР», РЅРµ Р°РєС‚РёРІРёСЂСѓРµС‚СЃСЏ РёР»Рё РІРѕР·РЅРёРє РІРѕРїСЂРѕСЃ СЃРѕ РІС…РѕРґРѕРј, РїРѕРґРґРµСЂР¶РєР° РїРѕРјРѕРіР°РµС‚ Р±С‹СЃС‚СЂРѕ СЂРµС€РёС‚СЊ СЌС‚Рѕ Р±РµР· Р»РёС€РЅРµР№ РїРµСЂРµРїРёСЃРєРё.</p>
            </article>

            <article className="landing-card">
              <h3>РџСЂРѕРґР»РµРЅРёРµ Рё РґРѕСЃС‚СѓРї</h3>
              <p>Р§РµСЂРµР· РїРѕРґРґРµСЂР¶РєСѓ РјРѕР¶РЅРѕ СѓС‚РѕС‡РЅРёС‚СЊ СЃС‚Р°С‚СѓСЃ РґРѕСЃС‚СѓРїР°, РїСЂРѕРґР»РµРЅРёРµ Рё Р»СЋР±С‹Рµ РІРѕРїСЂРѕСЃС‹, СЃРІСЏР·Р°РЅРЅС‹Рµ СЃ РїРѕРґРїРёСЃРєРѕР№.</p>
            </article>

            <article className="landing-card">
              <h3>РЎРІСЏР·СЊ РІ Telegram</h3>
              <p>РџРѕРґРґРµСЂР¶РєР° РЅР°С…РѕРґРёС‚СЃСЏ РІ Telegram, РїРѕСЌС‚РѕРјСѓ РЅР°РїРёСЃР°С‚СЊ РјРѕР¶РЅРѕ РІ Р»СЋР±РѕР№ РјРѕРјРµРЅС‚ Рё РїРѕР»СѓС‡РёС‚СЊ РѕС‚РІРµС‚ С‚Р°Рј Р¶Рµ, РіРґРµ РІР°Рј СѓРґРѕР±РЅРѕ.</p>
            </article>
          </div>

          <div className="landing-support-note">
            Р•СЃР»Рё Сѓ РІР°СЃ РІРѕРїСЂРѕСЃ РїРѕ РѕРїР»Р°С‚Рµ, С‚РѕРєРµРЅСѓ РёР»Рё РґРѕСЃС‚СѓРїСѓ Рє Limitless, РїСЂРѕСЃС‚Рѕ РЅР°РїРёС€РёС‚Рµ РІ Telegram-РїРѕРґРґРµСЂР¶РєСѓ.
            <button type="button" className="landing-support-btn" onClick={openSupportBot}>
              РћС‚РєСЂС‹С‚СЊ РїРѕРјРѕС‰СЊ РІ Telegram
            </button>
          </div>
        </section>

        <footer className="landing-footer">
          <span className="landing-footer-copy">В© 2026 Limitless</span>
          <div className="landing-footer-links">
            <a href="/terms" className="landing-footer-link">
              РџРѕР»СЊР·РѕРІР°С‚РµР»СЊСЃРєРѕРµ СЃРѕРіР»Р°С€РµРЅРёРµ
            </a>
            <a href={supportBotUrl} className="landing-footer-link" target="_blank" rel="noopener noreferrer">
              РџРѕРґРґРµСЂР¶РєР°
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
};
