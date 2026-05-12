use anyhow::{Result, bail};

mod api_client;
mod commands;
mod config;

fn main() {
    if let Err(error) = run() {
        eprintln!("error: {}", sanitize_error(&error.to_string()));
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() || is_help_flag(&args[0]) {
        print_help();
        return Ok(());
    }
    if args[0] == "help" {
        return print_help_command(&args[1..]);
    }
    if is_known_command(&args[0]) && args[1..].iter().any(|arg| is_help_flag(arg)) {
        print_command_help(&args[0])?;
        return Ok(());
    }
    match args[0].as_str() {
        "login" => commands::login::run(parse_login_username(&args[1..])?),
        "logout" => {
            ensure_no_args("logout", &args[1..])?;
            commands::logout::run()
        }
        "whoami" => {
            ensure_no_args("whoami", &args[1..])?;
            commands::whoami::run()
        }
        "get" => {
            let (request_id, wait, timeout_seconds) = parse_get(&args[1..])?;
            commands::get::run(&request_id, wait, timeout_seconds)
        }
        "send" => commands::send::run(&parse_send_message(&args[1..])?),
        unknown => bail!(
            "unknown command: {}. Use `jackson send \"your message\"` to send a message",
            unknown
        ),
    }
}

fn ensure_no_args(command: &str, args: &[String]) -> Result<()> {
    if !args.is_empty() {
        bail!("{} does not accept arguments", command);
    }
    Ok(())
}

fn is_help_flag(arg: &str) -> bool {
    arg == "--help" || arg == "-h"
}

fn is_known_command(command: &str) -> bool {
    matches!(command, "login" | "logout" | "whoami" | "get" | "send")
}

fn print_help_command(args: &[String]) -> Result<()> {
    match args {
        [] => {
            print_help();
            Ok(())
        }
        [command] => print_command_help(command),
        _ => bail!("help accepts at most one command"),
    }
}

fn print_command_help(command: &str) -> Result<()> {
    match command {
        "login" => {
            println!("jackson login [--username <name>]");
            println!();
            println!(
                "Claim a backend username and store local credentials. The credentials will persist forever."
            );
            println!();
            println!("Options:");
            println!("  -u, --username <name>  Username to claim without prompting");
            println!("  -h, --help             Show help for login");
        }
        "logout" => {
            println!("jackson logout");
            println!();
            println!("Remove the local credentials file.");
            println!();
            println!("Options:");
            println!("  -h, --help  Show help for logout");
        }
        "whoami" => {
            println!("jackson whoami");
            println!();
            println!("Show the username stored in local credentials.");
            println!();
            println!("Options:");
            println!("  -h, --help  Show help for whoami");
        }
        "get" => {
            println!("jackson get <request_id> [--wait] [--timeout-seconds <seconds>]");
            println!();
            println!("Show request status, or print the reply when one is available.");
            println!();
            println!("Options:");
            println!("  --wait                       Wait for a reply before returning");
            println!("  --timeout-seconds <seconds>  Maximum wait time when using --wait");
            println!("  -h, --help                   Show help for get");
        }
        "send" => {
            println!("jackson send <message>");
            println!();
            println!("Send a message to the Telegram operator and print the request_id.");
            println!();
            println!("Options:");
            println!("  -h, --help  Show help for send");
        }
        unknown => bail!("unknown help topic: {}", unknown),
    }
    Ok(())
}

fn parse_login_username(args: &[String]) -> Result<Option<String>> {
    let mut username = None;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--username" | "-u" => {
                username = Some(
                    iter.next()
                        .ok_or_else(|| anyhow::anyhow!("--username requires a value"))?
                        .to_string(),
                )
            }
            unknown => bail!("unknown login option: {}", unknown),
        }
    }
    Ok(username)
}

fn parse_get(args: &[String]) -> Result<(String, bool, u64)> {
    if args.is_empty() {
        bail!("request_id is required");
    }
    let request_id = args[0].clone();
    let mut wait = false;
    let mut timeout_seconds = 30;
    let mut iter = args[1..].iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--wait" => wait = true,
            "--timeout-seconds" => {
                timeout_seconds = iter
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--timeout-seconds requires a value"))?
                    .parse()?
            }
            unknown => bail!("unknown get option: {}", unknown),
        }
    }
    Ok((request_id, wait, timeout_seconds))
}

fn parse_send_message(args: &[String]) -> Result<String> {
    let message = args.join(" ");
    if message.trim().is_empty() {
        bail!("message is required");
    }
    Ok(message)
}

fn print_help() {
    println!("Jackson CLI");
    println!();
    println!("Usage:");
    println!("  jackson <command>");
    println!(
        "  jackson send <message>                        Send message to Jackson and return a request_id"
    );
    println!();
    println!("Commands:");
    println!(
        "  send <message>                                Send message to Jackson and return a request_id"
    );
    println!(
        "  login [--username <name>]                     Claim a username and store local credentials; credentials persist forever"
    );
    println!("  logout                                        Remove local credentials");
    println!("  whoami                                        Show the current login username");
    println!("  get <request_id> [--wait] [--timeout-seconds <seconds>]");
    println!("                                                Show request status or reply");
    println!(
        "  help [command]                                Show help for all commands or one command"
    );
    println!();
    println!("Examples:");
    println!("  jackson login --username jackson");
    println!("  jackson send \"how are you?\"");
    println!("  jackson get req_abc --wait");
    println!("  jackson whoami");
    println!("  jackson logout");
    println!();
    println!("Options:");
    println!("  -h, --help                                    Show help");
}

fn sanitize_error(message: &str) -> String {
    let tokenish = std::env::var("JACKSON_TEST_TOKEN").unwrap_or_default();
    if !tokenish.is_empty() {
        return message.replace(&tokenish, &config::redact(&tokenish));
    }
    message.to_string()
}
