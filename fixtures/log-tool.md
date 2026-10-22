# Logs, but readable

A command line tool for developers that tails application logs and groups
repeated lines, highlights errors and collapses stack traces.
Pipe any log into it: `my-service | tool`.

Written in Rust, single binary, works with plain text and JSON logs.
Aimed at backend engineers who debug production issues at 2am.
