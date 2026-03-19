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

fn get_local_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "unknown".into())
}

fn get_public_ip() -> String {
    use std::net::ToSocketAddrs;
    let addr = match "api4.ipify.org:80"
        .to_socket_addrs()
        .ok()
        .and_then(|mut addrs| addrs.next())
    {
        Some(a) => a,
        None => return "unavailable".into(),
    };
    std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_secs(3))
        .ok()
        .and_then(|mut stream| {
        use std::io::{Read, Write};
        stream
            .write_all(b"GET / HTTP/1.1\r\nHost: api4.ipify.org\r\nConnection: close\r\n\r\n")
            .ok()?;
        let mut buf = String::new();
        stream.read_to_string(&mut buf).ok()?;
        buf.rsplit("\r\n\r\n")
            .next()
            .map(|body| body.trim().to_string())
    })
    .filter(|ip| !ip.is_empty())
    .unwrap_or_else(|| "unavailable".into())
}

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let args = Args::parse();

    log::info!("tinydo-sync v{} starting up", env!("CARGO_PKG_VERSION"));
    log::info!("  database: {}", args.db_path);
    log::info!("  port:     {}", args.port);

    let local_ip = get_local_ip();
    let public_ip = get_public_ip();

    log::info!("  LAN:      http://{}:{}", local_ip, args.port);
    if public_ip != "unavailable" {
        log::info!("  WAN:      http://{}:{}", public_ip, args.port);
    } else {
        log::info!("  WAN:      (could not detect public IP)");
    }

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
