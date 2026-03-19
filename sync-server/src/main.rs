mod db;
mod models;
mod routes;

use std::sync::{Arc, Mutex};

use axum::{
    routing::{delete, get, post},
    Router,
};
use clap::Parser;
use tower_http::cors::CorsLayer;

use db::AppState;

const THIRTY_DAYS_SECS: i64 = 30 * 24 * 60 * 60;

#[derive(Parser)]
#[command(name = "tinydo-sync", version, about = "TinyDo sync server")]
struct Args {
    #[arg(long, env = "TINYDO_SYNC_PORT", default_value = "8745")]
    port: u16,

    #[arg(long, env = "TINYDO_SYNC_DB", default_value = "./tinydo-sync.db")]
    db_path: String,
}

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let args = Args::parse();

    log::info!("tinydo-sync v{} starting up", env!("CARGO_PKG_VERSION"));
    log::info!("  database: {}", args.db_path);
    log::info!("  port:     {}", args.port);

    let conn = db::init_db(&args.db_path);
    log::info!("Database initialized");

    let stale = db::cleanup_stale_changes(&conn, THIRTY_DAYS_SECS);
    if stale > 0 {
        log::info!(
            "Startup cleanup: removed {} stale change_log entries (>30 days)",
            stale
        );
    }

    let state = Arc::new(AppState {
        db: Mutex::new(conn),
    });

    let app = Router::new()
        .route("/api/health", get(routes::health))
        .route("/api/register", post(routes::register))
        .route("/api/changes", post(routes::push_changes))
        .route("/api/changes", get(routes::pull_changes))
        .route("/api/snapshot", post(routes::upload_snapshot))
        .route("/api/snapshot/latest", get(routes::get_latest_snapshot))
        .route("/api/status", get(routes::status))
        .route("/api/cleanup", post(routes::cleanup))
        .route("/api/devices/{device_id}", delete(routes::delete_device))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", args.port);
    log::info!("Listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
