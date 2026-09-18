export function createInputController({ mode = 'site', engine, onOutput = () => {}, onHeldKeys = () => {} }) {
  const pressed = new Set();

  function emitSiteOutput() {
    if (!engine || pressed.size === 0) return;
    const result = engine.convert([...pressed]);
    if (result.text) onOutput(result.text, result);
    return result;
  }

  return {
    mode,
    handleBeforeInput(event) {
      if (mode !== 'converted' || !event?.data) return;
      onOutput(event.data, { text: event.data, kind: 'converted' });
    },
    handleKeyDown(event) {
      if (mode !== 'site' || !event?.code || event.repeat) return;
      pressed.add(event.code);
      onHeldKeys([...pressed]);
    },
    handleKeyUp(event) {
      if (mode !== 'site' || !event?.code) return;
      if (pressed.size > 1) {
        emitSiteOutput();
        pressed.clear();
      } else {
        emitSiteOutput();
        pressed.delete(event.code);
      }
      onHeldKeys([...pressed]);
    },
    clear() {
      pressed.clear();
      onHeldKeys([]);
    },
    get pressed() {
      return [...pressed];
    }
  };
}
