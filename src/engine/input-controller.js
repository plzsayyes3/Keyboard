export function createInputController({ mode = 'site', engine, onOutput = () => {}, onHeldKeys = () => {} }) {
  const pressed = new Set();
  let chordLatched = false;
  const ignoredModifierCodes = new Set([
    'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight',
    'AltLeft', 'AltRight', 'CapsLock', 'Fn', 'FnLock', 'OSLeft', 'OSRight'
  ]);

  function emitSiteOutput() {
    if (!engine || pressed.size === 0) return;
    const result = engine.convert([...pressed]);
    if (result.text) onOutput(result.text, result);
    return result;
  }

  function isPhysicalCode(code) {
    return Boolean(code) && !ignoredModifierCodes.has(code);
  }

  return {
    mode,
    handleBeforeInput(event) {
      if (mode !== 'converted' || !event?.data) return;
      onOutput(event.data, { text: event.data, kind: 'converted' });
    },
    handleKeyDown(event) {
      if (mode !== 'site' || !isPhysicalCode(event?.code) || event.repeat) return;
      if (chordLatched) return;
      pressed.add(event.code);
      onHeldKeys([...pressed]);
    },
    handleKeyUp(event) {
      if (mode !== 'site' || !isPhysicalCode(event?.code)) return;
      if (chordLatched) {
        pressed.delete(event.code);
        if (pressed.size === 0) chordLatched = false;
        onHeldKeys([...pressed]);
        return;
      }
      const result = engine && pressed.size ? engine.convert([...pressed]) : null;
      if (result?.text || result?.action || pressed.size > 1) {
        if (result?.text || result?.action) onOutput(result.text, result);
        chordLatched = true;
      }
      pressed.delete(event.code);
      if (pressed.size === 0) chordLatched = false;
      onHeldKeys([...pressed]);
    },
    clear() {
      pressed.clear();
      chordLatched = false;
      onHeldKeys([]);
    },
    get pressed() {
      return [...pressed];
    }
  };
}
