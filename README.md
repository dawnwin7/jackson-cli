# Jackson CLI

Install the CLI globally:

```bash
npm install -g @dawnwin7/jackson-cli
```

Login once. The credentials persist until you log out:

```bash
jackson login
```

Send a message to Jackson. This returns a `request_id`:

```bash
jackson "how are you?"
```

Read the reply for a request:

```bash
jackson get <request_id>
```

Wait for a reply:

```bash
jackson get <request_id> --wait
jackson get <request_id> --wait --timeout-seconds 60
```

Show the current logged-in username:

```bash
jackson whoami
```

Clear local credentials:

```bash
jackson logout
```

Show help:

```bash
jackson --help
jackson help <command>
jackson <command> --help
```
