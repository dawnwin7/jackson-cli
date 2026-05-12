# @dawnwin7/jackson-cli

Global npm wrapper for the Jackson CLI.

## Install

```bash
npm i -g @dawnwin7/jackson-cli
```

Then run:

```bash
jackson login
jackson "hello"
jackson get <request_id> --wait
```

Credentials are stored at `~/.jackson/credentials.json` by default and persist forever unless removed with `jackson logout`.
