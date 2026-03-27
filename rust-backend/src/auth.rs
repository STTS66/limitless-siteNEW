use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthToken {
    pub token: String,
    pub user_id: String,
    pub created_at: String,
    pub expires_at: Option<String>,
}

pub fn validate_token_format(token: &str) -> bool {
    let mut parts = token.split('-');
    let Some(prefix) = parts.next() else {
        return false;
    };
    let Some(timestamp) = parts.next() else {
        return false;
    };
    let Some(random_part) = parts.next() else {
        return false;
    };

    if parts.next().is_some() {
        return false;
    }

    prefix == "LMT"
        && timestamp.len() == 13
        && timestamp.chars().all(|ch| ch.is_ascii_digit())
        && random_part.len() == 16
        && random_part
            .chars()
            .all(|ch| matches!(ch, '0'..='9' | 'a'..='f'))
}
