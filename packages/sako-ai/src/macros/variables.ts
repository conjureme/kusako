import type { Macro } from '../types/prompt';

const localVariables = new Map<string, string>();
const globalVariables = new Map<string, string>();

function toNumber(value: string): number {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

export function setLocalVariable(name: string, value: string): string {
  localVariables.set(name, value);
  return '';
}

export function getLocalVariable(name: string): string {
  return localVariables.get(name) ?? '';
}

export function addLocalVariable(name: string, value: string): string {
  const current = getLocalVariable(name);
  const numCurrent = Number(current);
  const numValue = Number(value);
  if (!isNaN(numCurrent) && !isNaN(numValue)) {
    localVariables.set(name, String(numCurrent + numValue));
  } else {
    localVariables.set(name, current + value);
  }
  return '';
}

export function incrementLocalVariable(name: string): string {
  const value = toNumber(getLocalVariable(name)) + 1;
  localVariables.set(name, String(value));
  return String(value);
}

export function decrementLocalVariable(name: string): string {
  const value = toNumber(getLocalVariable(name)) - 1;
  localVariables.set(name, String(value));
  return String(value);
}

export function setGlobalVariable(name: string, value: string): string {
  globalVariables.set(name, value);
  return '';
}

export function getGlobalVariable(name: string): string {
  return globalVariables.get(name) ?? '';
}

export function addGlobalVariable(name: string, value: string): string {
  const current = getGlobalVariable(name);
  const numCurrent = Number(current);
  const numValue = Number(value);
  if (!isNaN(numCurrent) && !isNaN(numValue)) {
    globalVariables.set(name, String(numCurrent + numValue));
  } else {
    globalVariables.set(name, current + value);
  }
  return '';
}

export function incrementGlobalVariable(name: string): string {
  const value = toNumber(getGlobalVariable(name)) + 1;
  globalVariables.set(name, String(value));
  return String(value);
}

export function decrementGlobalVariable(name: string): string {
  const value = toNumber(getGlobalVariable(name)) - 1;
  globalVariables.set(name, String(value));
  return String(value);
}

export function clearLocalVariables(): void {
  localVariables.clear();
}

export function clearGlobalVariables(): void {
  globalVariables.clear();
}

export function getVariableMacros(): Macro[] {
  return [
    {
      regex: /{{setvar::([^:]+)::([^}]*)}}/gi,
      replace: (_, name, value) => {
        setLocalVariable(name.trim(), value);
        return '';
      },
    },
    {
      regex: /{{addvar::([^:]+)::([^}]+)}}/gi,
      replace: (_, name, value) => {
        addLocalVariable(name.trim(), value);
        return '';
      },
    },
    {
      regex: /{{incvar::([^}]+)}}/gi,
      replace: (_, name) => incrementLocalVariable(name.trim()),
    },
    {
      regex: /{{decvar::([^}]+)}}/gi,
      replace: (_, name) => decrementLocalVariable(name.trim()),
    },
    {
      regex: /{{getvar::([^}]+)}}/gi,
      replace: (_, name) => getLocalVariable(name.trim()),
    },
    {
      regex: /{{setglobalvar::([^:]+)::([^}]*)}}/gi,
      replace: (_, name, value) => {
        setGlobalVariable(name.trim(), value);
        return '';
      },
    },
    {
      regex: /{{addglobalvar::([^:]+)::([^}]+)}}/gi,
      replace: (_, name, value) => {
        addGlobalVariable(name.trim(), value);
        return '';
      },
    },
    {
      regex: /{{incglobalvar::([^}]+)}}/gi,
      replace: (_, name) => incrementGlobalVariable(name.trim()),
    },
    {
      regex: /{{decglobalvar::([^}]+)}}/gi,
      replace: (_, name) => decrementGlobalVariable(name.trim()),
    },
    {
      regex: /{{getglobalvar::([^}]+)}}/gi,
      replace: (_, name) => getGlobalVariable(name.trim()),
    },
  ];
}
