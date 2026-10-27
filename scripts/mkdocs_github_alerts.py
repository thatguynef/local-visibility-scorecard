"""Convert GitHub-style alert blockquotes to MkDocs admonitions."""

from __future__ import annotations

import re


def on_page_markdown(markdown, **kwargs):
    pattern = re.compile(
        r"^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n((?:> ?.*\n?)+)",
        re.MULTILINE | re.IGNORECASE,
    )

    def replace(match: re.Match) -> str:
        kind = match.group(1).lower()
        body = "\n".join(line.removeprefix("> ").removeprefix(">") for line in match.group(2).splitlines())
        return f'!!! {kind} ""\n\n    ' + body.replace("\n", "\n    ") + "\n"

    return pattern.sub(replace, markdown)
