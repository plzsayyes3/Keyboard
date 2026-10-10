export function createInputController({ mode = 'site', engine, onOutput = () => {}, onHeldKeys = () => {} }) {
  const pressed = new Set();
  let chordLatched = false;
  let beforeInputEcho = null;
  let pendingKeydown = null;
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

  function isMappedPhysicalCode(code) {
    const physicalKeys = engine?.index?.physicalKeys;
    return !physicalKeys?.length || physicalKeys.includes(code) || code === engine?.index?.centerShiftKey;
  }

  function emitConvertedText(value, event = {}) {
    if (mode !== 'converted' || !value || event.isComposing || event.key === 'Process') return false;
    onOutput(value, { text: value, kind: 'converted', source: event.type ?? 'converted' });
    return true;
  }

  function isEditableTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(String(target.tagName ?? '').toUpperCase());
  }

  function isKanaKey(value) {
    return typeof value === 'string' && /^[ぁ-ゖァ-ヺーゝゞゟ。、・「」『』（）！？…〜]+$/u.test(value);
  }

  function cancelPendingKeydown() {
    if (pendingKeydown) clearTimeout(pendingKeydown.timer);
    pendingKeydown = null;
  }

  function clearCaptureValue(target, isComposing) {
    if (target?.id === 'converted-input' && !isComposing) target.value = '';
  }

  function handleBeforeInput(event) {
    if (mode !== 'converted') return;
    if (event?.isComposing) { cancelPendingKeydown(); return; }
    if (!event?.data) return;
    if (pendingKeydown?.key === event.data) cancelPendingKeydown();
    emitConvertedText(event.data, { isComposing: event.isComposing, key: event.key, type: 'beforeinput' });
    beforeInputEcho = { target: event.target, data: event.data, time: event.timeStamp ?? Date.now() };
  }

  function handleInput(event) {
    if (mode !== 'converted') return;
    const isComposing = Boolean(event?.isComposing);
    if (isComposing) { cancelPendingKeydown(); return; }
    const value = event?.data || (event?.target?.id === 'converted-input' ? event.target.value : '');
    if (!value) return;
    if (pendingKeydown?.key === value) cancelPendingKeydown();
    const echo = beforeInputEcho;
    beforeInputEcho = null;
    const eventTime = event.timeStamp ?? Date.now();
    const isBeforeInputEcho = echo && echo.target === event.target && echo.data === value && eventTime - echo.time <= 250;
    if (!isBeforeInputEcho) emitConvertedText(value, { isComposing, key: event.key, type: 'input' });
    clearCaptureValue(event.target, isComposing);
  }

  function handleKeyDown(event) {
    if (mode === 'converted') {
      if (event?.target?.id === 'converted-input' || isEditableTarget(event?.target)) return;
      if (event?.isComposing || event?.key === 'Process') { cancelPendingKeydown(); return; }
      if (isKanaKey(event?.key)) {
        cancelPendingKeydown();
        const key = event.key;
        const timer = setTimeout(() => {
          if (pendingKeydown?.timer === timer) {
            pendingKeydown = null;
            emitConvertedText(key, { isComposing: false, key, type: 'keydown' });
          }
        }, 0);
        pendingKeydown = { key, timer };
      }
      return;
    }

    if (mode !== 'site' || !isPhysicalCode(event?.code) || !isMappedPhysicalCode(event.code) || isEditableTarget(event?.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault?.();
    if (event.repeat || chordLatched) return;
    pressed.add(event.code);
    onHeldKeys([...pressed]);
  }

  function handleKeyUp(event) {
    if (mode !== 'site' || !isPhysicalCode(event?.code)) return;
    if (!pressed.has(event.code)) return;
    if (chordLatched) {
      pressed.delete(event.code);
      if (pressed.size === 0) chordLatched = false;
      onHeldKeys([...pressed]);
      return;
    }
    const result = engine && pressed.size ? engine.convert([...pressed]) : null;
    if (result && result.kind !== 'empty') {
      if (result.text || result.action || result.kind === 'unknown' || result.kind === 'ambiguous') {
        onOutput(result.text ?? '', result);
      }
      chordLatched = pressed.size > 1 || Boolean(result.text || result.action);
    }
    pressed.delete(event.code);
    if (pressed.size === 0) chordLatched = false;
    onHeldKeys([...pressed]);
  }

  function clear() {
    cancelPendingKeydown();
    beforeInputEcho = null;
    pressed.clear();
    chordLatched = false;
    onHeldKeys([]);
  }

  return {
    mode,
    handleBeforeInput,
    handleInput,
    handleKeyDown,
    handleKeyUp,
    clear,
    get pressed() {
      return [...pressed];
    }
  };
}
