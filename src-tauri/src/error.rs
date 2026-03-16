use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Base64 decode error: {0}")]
    Base64(#[from] base64::DecodeError),

    #[error("{0}")]
    Custom(String),
}

impl AppError {
    pub fn custom(msg: impl Into<String>) -> Self {
        Self::Custom(msg.into())
    }

    pub fn error_code(&self) -> &'static str {
        match self {
            AppError::Db(_) => "DATABASE_ERROR",
            AppError::Io(_) => "IO_ERROR",
            AppError::Json(_) => "PARSE_ERROR",
            AppError::Base64(_) => "PARSE_ERROR",
            AppError::Custom(_) => "APP_ERROR",
        }
    }

    pub fn user_message(&self) -> String {
        match self {
            AppError::Db(_) => "数据库操作失败".into(),
            AppError::Io(_) => "文件读写失败".into(),
            AppError::Json(_) => "数据格式异常".into(),
            AppError::Base64(_) => "数据解码失败".into(),
            AppError::Custom(msg) => msg.clone(),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        log::error!("[{}] {}", self.error_code(), self);

        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.error_code())?;
        s.serialize_field("message", &self.user_message())?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_display() {
        let e = AppError::custom("something went wrong");
        assert_eq!(e.to_string(), "something went wrong");
    }

    #[test]
    fn error_serializes_as_structured_json() {
        let e = AppError::custom("test error");
        let json = serde_json::to_string(&e).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["code"], "APP_ERROR");
        assert_eq!(parsed["message"], "test error");
    }

    #[test]
    fn db_error_has_stable_user_message() {
        let e = AppError::Db(rusqlite::Error::QueryReturnedNoRows);
        let json = serde_json::to_string(&e).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["code"], "DATABASE_ERROR");
        assert_eq!(parsed["message"], "数据库操作失败");
        assert!(!json.contains("QueryReturnedNoRows"));
    }

    #[test]
    fn io_error_converts() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let app_err: AppError = io_err.into();
        assert!(app_err.to_string().contains("file not found"));

        let json = serde_json::to_string(&app_err).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["code"], "IO_ERROR");
        assert_eq!(parsed["message"], "文件读写失败");
    }

    #[test]
    fn error_codes_are_correct() {
        assert_eq!(AppError::custom("x").error_code(), "APP_ERROR");
        assert_eq!(
            AppError::Db(rusqlite::Error::QueryReturnedNoRows).error_code(),
            "DATABASE_ERROR"
        );
    }
}
