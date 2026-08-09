import type { Node } from './ast.js';

function parseHead(head: string): { name: string; captureName: string | null } {
  const match = /^(.*\S)\s+as\s+(\w+)\s*$/i.exec(head);

  if (match) {
    return {
      name: match[1]!.trim().toLowerCase(),
      captureName: match[2]!.toLowerCase(),
    };
  }

  return { name: head.trim().toLowerCase(), captureName: null };
}

function parsePlaceholder(raw: string): Node {
  const inner = raw.slice(1, -1);
  const sep = inner.indexOf(':');
  const head = sep === -1 ? inner : inner.slice(0, sep);
  const { name, captureName } = parseHead(head);
  const args =
    sep === -1
      ? []
      : inner
          .slice(sep + 1)
          .split('|')
          .map((arg) => arg.trim());

  return { kind: 'placeholder', name, args, captureName, raw };
}

function parseCaptureRef(raw: string): Node {
  return {
    kind: 'capture-ref',
    name: raw.slice(1, -1).trim().toLowerCase(),
    raw,
  };
}

export function parse(template: string): Node[] {
  const nodes: Node[] = [];
  let text = '';
  let i = 0;

  const flushText = () => {
    if (text.length > 0) {
      nodes.push({ kind: 'text', value: text });
      text = '';
    }
  };

  while (i < template.length) {
    const char = template[i];
    const next = template[i + 1];

    if (
      char === next &&
      (char === '{' || char === '}' || char === '[' || char === ']')
    ) {
      text += char;
      i += 2;
      continue;
    }

    if (char === '{' || char === '[') {
      const close = char === '{' ? '}' : ']';
      const end = template.indexOf(close, i + 1);

      if (end === -1) {
        text += char;
        i += 1;
        continue;
      }

      const raw = template.slice(i, end + 1);
      flushText();
      nodes.push(char === '{' ? parsePlaceholder(raw) : parseCaptureRef(raw));
      i = end + 1;
      continue;
    }

    text += char;
    i += 1;
  }

  flushText();
  return nodes;
}
