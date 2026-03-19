mod db;
mod models;
mod routes;

use std::sync::{Arc, Mutex};

use axum::{
    routing::{get, post},
    Router,
};
use clap::Parser;
use tower_http::cors::CorsLayer;

use db::AppState;

#[derive(Parser)]
#[command(name = "tinydo-sync", about = "TinyDo sync server")]
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
    let conn = db::init_db(&args.db_path);

    let state = Arc::new(AppState {
        db: Mutex::new(conn),
    });

    let app = Router::new()
        .route("/api/register", post(routes::register))
        .route("/api/changes", post(routes::push_changes))
        .route("/api/changes", get(routes::pull_changes))
        .route("/api/snapshot", post(routes::upload_snapshot))
        .route("/api/snapshot/latest", get(routes::get_latest_snapshot))
        .route("/api/status", get(routes::status))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", args.port);
    log::info!("TinyDo sync server listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
