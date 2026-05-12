use assert_cmd::prelude::*;
use serde_json::json;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use tempfile::TempDir;

#[derive(Clone)]
struct ResponseSpec {
    status: u16,
    body: String,
}

fn spawn_server(responses: Vec<ResponseSpec>) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let responses = Arc::new(Mutex::new(responses));
    thread::spawn(move || {
        for stream in listener.incoming() {
            let mut stream = stream.unwrap();
            let _request = read_request(&mut stream);
            let response = responses.lock().unwrap().remove(0);
            write_response(&mut stream, response.status, &response.body);
            if responses.lock().unwrap().is_empty() {
                break;
            }
        }
    });
    format!("http://{}", addr)
}

fn read_request(stream: &mut TcpStream) -> String {
    let mut buffer = [0_u8; 8192];
    let size = stream.read(&mut buffer).unwrap();
    String::from_utf8_lossy(&buffer[..size]).to_string()
}

fn write_response(stream: &mut TcpStream, status: u16, body: &str) {
    let status_text = if status == 200 { "OK" } else { "ERROR" };
    write!(
        stream,
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status,
        status_text,
        body.len(),
        body
    )
    .unwrap();
}

fn command(config: &TempDir, base_url: &str) -> Command {
    let mut cmd = Command::cargo_bin("jackson").unwrap();
    cmd.env("JACKSON_CONFIG_HOME", config.path())
        .env("JACKSON_API_BASE_URL", base_url)
        .env("NO_PROXY", "127.0.0.1,localhost,::1")
        .env("no_proxy", "127.0.0.1,localhost,::1");
    cmd
}

#[test]
fn login_writes_credentials_without_printing_token() {
    let config = TempDir::new().unwrap();
    let token = "test-token-secret";
    let base_url = spawn_server(vec![ResponseSpec {
        status: 200,
        body: json!({"username_normalized":"alice","claimed":true,"token":token}).to_string(),
    }]);
    let output = command(&config, &base_url)
        .args(["login", "--username", "Alice"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("logged in as alice"));
    assert!(!stdout.contains(token));
    let credentials_path = config.path().join("jackson").join("credentials.json");
    let credentials = fs::read_to_string(&credentials_path).unwrap();
    assert!(credentials.contains(token));
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&credentials_path)
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}

#[test]
fn help_lists_commands_with_descriptions_and_command_help() {
    let config = TempDir::new().unwrap();
    let output = command(&config, "ignored").arg("--help").output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Usage:"));
    assert!(stdout.contains("jackson \"<message>\""));
    assert!(stdout.contains("Send message to Jackson"));
    assert!(stdout.contains("return a request_id"));
    assert!(stdout.contains("Commands:"));
    assert!(stdout.contains("login [--username <name>]"));
    assert!(stdout.contains("credentials persist forever"));
    assert!(stdout.contains("logout"));
    assert!(stdout.contains("Remove local credentials"));
    assert!(stdout.contains("whoami"));
    assert!(stdout.contains("Show the current login username"));
    assert!(stdout.contains("help [command]"));

    let login_help = command(&config, "ignored")
        .args(["help", "login"])
        .output()
        .unwrap();
    assert!(login_help.status.success());
    let login_stdout = String::from_utf8_lossy(&login_help.stdout);
    assert!(login_stdout.contains("jackson login [--username <name>]"));
    assert!(login_stdout.contains("The credentials will persist forever."));
    assert!(login_stdout.contains("-u, --username <name>"));

    let get_help = command(&config, "ignored")
        .args(["get", "--help"])
        .output()
        .unwrap();
    assert!(get_help.status.success());
    let get_stdout = String::from_utf8_lossy(&get_help.stdout);
    assert!(get_stdout.contains("jackson get <request_id>"));
    assert!(get_stdout.contains("--timeout-seconds <seconds>"));
}

#[test]
fn bare_send_requires_credentials_and_prints_request_id() {
    let config = TempDir::new().unwrap();
    let missing = command(&config, "http://127.0.0.1:9")
        .arg("how are you?")
        .output()
        .unwrap();
    assert!(!missing.status.success());
    assert!(String::from_utf8_lossy(&missing.stderr).contains("login required"));

    fs::create_dir_all(config.path().join("jackson")).unwrap();
    fs::write(
        config.path().join("jackson").join("credentials.json"),
        json!({"username_normalized":"alice","token":"token-123","api_base_url":"PLACEHOLDER"})
            .to_string(),
    )
    .unwrap();
    let base_url = spawn_server(vec![ResponseSpec {
        status: 200,
        body: json!({"request_id":"req_abc"}).to_string(),
    }]);
    let credentials =
        json!({"username_normalized":"alice","token":"token-123","api_base_url":base_url})
            .to_string();
    fs::write(
        config.path().join("jackson").join("credentials.json"),
        credentials,
    )
    .unwrap();
    let output = command(&config, "ignored")
        .arg("how are you?")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        "request_id: req_abc"
    );
}

#[test]
fn whoami_prints_current_login_username() {
    let config = TempDir::new().unwrap();
    let missing = command(&config, "http://127.0.0.1:9")
        .arg("whoami")
        .output()
        .unwrap();
    assert!(!missing.status.success());
    assert!(String::from_utf8_lossy(&missing.stderr).contains("login required"));

    fs::create_dir_all(config.path().join("jackson")).unwrap();
    fs::write(
        config.path().join("jackson").join("credentials.json"),
        json!({"username_normalized":"alice","token":"token-123","api_base_url":"http://127.0.0.1:9"})
            .to_string(),
    )
    .unwrap();
    let output = command(&config, "ignored").arg("whoami").output().unwrap();
    assert!(output.status.success());
    assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "alice");
}

#[test]
fn logout_clears_local_credentials() {
    let config = TempDir::new().unwrap();
    let credentials_path = config.path().join("jackson").join("credentials.json");
    fs::create_dir_all(credentials_path.parent().unwrap()).unwrap();
    fs::write(
        &credentials_path,
        json!({"username_normalized":"alice","token":"token-123","api_base_url":"http://127.0.0.1:9"})
            .to_string(),
    )
    .unwrap();

    let output = command(&config, "ignored").arg("logout").output().unwrap();
    assert!(output.status.success());
    assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "logged out");
    assert!(!credentials_path.exists());

    let second = command(&config, "ignored").arg("logout").output().unwrap();
    assert!(second.status.success());
    assert_eq!(
        String::from_utf8_lossy(&second.stdout).trim(),
        "not logged in"
    );
}

#[test]
fn get_immediate_and_wait_outputs_pending_or_reply() {
    let config = TempDir::new().unwrap();
    let base_url = spawn_server(vec![
        ResponseSpec {
            status: 200,
            body: json!({"request_id":"req_pending","status":"pending","reply":null}).to_string(),
        },
        ResponseSpec {
            status: 200,
            body: json!({"request_id":"req_done","status":"replied","reply":"answer"}).to_string(),
        },
    ]);
    fs::create_dir_all(config.path().join("jackson")).unwrap();
    fs::write(
        config.path().join("jackson").join("credentials.json"),
        json!({"username_normalized":"alice","token":"token-123","api_base_url":base_url})
            .to_string(),
    )
    .unwrap();

    let pending = command(&config, "ignored")
        .args(["get", "req_pending"])
        .output()
        .unwrap();
    assert!(pending.status.success());
    assert_eq!(
        String::from_utf8_lossy(&pending.stdout).trim(),
        "req_pending: pending"
    );

    let replied = command(&config, "ignored")
        .args(["get", "req_done", "--wait"])
        .output()
        .unwrap();
    assert!(replied.status.success());
    assert_eq!(String::from_utf8_lossy(&replied.stdout).trim(), "answer");
}

#[test]
fn invalid_credentials_are_clear_and_send_alias_is_not_canonical() {
    let config = TempDir::new().unwrap();
    fs::create_dir_all(config.path().join("jackson")).unwrap();
    let base_url = spawn_server(vec![ResponseSpec {
        status: 401,
        body: json!({"detail":"invalid bearer token"}).to_string(),
    }]);
    fs::write(
        config.path().join("jackson").join("credentials.json"),
        json!({"username_normalized":"alice","token":"bad-token","api_base_url":base_url})
            .to_string(),
    )
    .unwrap();
    let invalid = command(&config, "ignored")
        .args(["get", "req_1"])
        .output()
        .unwrap();
    assert!(!invalid.status.success());
    assert!(String::from_utf8_lossy(&invalid.stderr).contains("authentication failed"));

    let send = command(&config, "ignored")
        .args(["send", "hello"])
        .output()
        .unwrap();
    assert!(!send.status.success());
    assert!(String::from_utf8_lossy(&send.stderr).contains("not canonical"));
}
