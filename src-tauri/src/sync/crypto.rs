use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    AeadCore, Aes256Gcm, Nonce,
};
use argon2::Argon2;
use sha2::{Digest, Sha256};

use crate::error::AppError;

const SALT_PREFIX: &[u8] = b"tinydo-sync-salt-v1";

fn derive_key(sync_key: &str) -> Result<[u8; 32], AppError> {
    let mut hasher = Sha256::new();
    hasher.update(SALT_PREFIX);
    hasher.update(sync_key.as_bytes());
    let salt = hasher.finalize();

    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(sync_key.as_bytes(), &salt, &mut key)
        .map_err(|e| AppError::custom(format!("Key derivation failed: {e}")))?;

    Ok(key)
}

pub fn encrypt(sync_key: &str, plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), AppError> {
    let key = derive_key(sync_key)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::custom(format!("Cipher init failed: {e}")))?;

    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| AppError::custom(format!("Encryption failed: {e}")))?;

    Ok((ciphertext, nonce.to_vec()))
}

pub fn decrypt(sync_key: &str, ciphertext: &[u8], nonce_bytes: &[u8]) -> Result<Vec<u8>, AppError> {
    let key = derive_key(sync_key)?;
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::custom(format!("Cipher init failed: {e}")))?;

    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| AppError::custom(format!("Decryption failed: {e}")))?;

    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = "test-sync-key-12345";
        let data = b"hello world, this is secret data";

        let (ciphertext, nonce) = encrypt(key, data).unwrap();
        assert_ne!(ciphertext, data);

        let plaintext = decrypt(key, &ciphertext, &nonce).unwrap();
        assert_eq!(plaintext, data);
    }

    #[test]
    fn wrong_key_fails() {
        let data = b"secret";
        let (ciphertext, nonce) = encrypt("correct-key", data).unwrap();
        let result = decrypt("wrong-key", &ciphertext, &nonce);
        assert!(result.is_err());
    }

    #[test]
    fn derive_key_deterministic() {
        let k1 = derive_key("same-key").unwrap();
        let k2 = derive_key("same-key").unwrap();
        assert_eq!(k1, k2);

        let k3 = derive_key("different-key").unwrap();
        assert_ne!(k1, k3);
    }
}
