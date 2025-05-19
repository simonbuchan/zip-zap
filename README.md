A simple package to create zip files in memory, including streaming
the content from a server, with progress.

There's a lot of libraries for creating zip files already, but I had
a lot of trouble getting a decent modern interface with progress reporting
that supports streaming from a server, so I wrote this.

Also supports reading zip files, though currently only with limited support,
not even decoding the DOS timestamp etc.; there are good libraries already
so I mostly just have it for validation.

For now the "documentation" is just the example in [`examples/web`]()

If there's any interest expressed
