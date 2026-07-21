import type { FolderChoice } from "./folders.ts";

// The options page's single control (iter E): a flat <select> of every
// bookmark folder, labelled by path, with the current choice pre-selected.
// Choosing fires onChoose (the shell messages setFolder to the background —
// the single writer; this page never touches storage itself) and reports the
// outcome on a status line. The render invariant extends to this third
// surface: folder titles are user-authored, not feed-supplied, but they reach
// the DOM via textContent only, never innerHTML — same rule, same fake-DOM
// policing (optionsRender.test.ts).
export function renderOptions(
  folders: FolderChoice[],
  currentId: string | null,
  doc: Document,
  onChoose: (id: string) => Promise<boolean>,
): HTMLElement {
  const block = doc.createElement("div");
  block.className = "chooser";

  const label = doc.createElement("label");
  label.className = "chooser-label";
  label.htmlFor = "folder-select";
  label.textContent = "Watched folder";
  block.appendChild(label);

  const select = doc.createElement("select") as HTMLSelectElement;
  select.className = "folder-select";
  select.id = "folder-select";
  if (currentId === null) {
    // No choice yet (fresh install): an inert placeholder holds the slot so
    // picking ANY real folder is a change event.
    const placeholder = doc.createElement("option") as HTMLOptionElement;
    placeholder.className = "placeholder";
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = "Choose a folder…";
    select.appendChild(placeholder);
  }
  for (const folder of folders) {
    const option = doc.createElement("option") as HTMLOptionElement;
    option.value = folder.id;
    option.textContent = folder.path;
    if (folder.id === currentId) option.selected = true;
    select.appendChild(option);
  }
  block.appendChild(select);

  const status = doc.createElement("span");
  status.className = "status";
  block.appendChild(status);

  select.addEventListener("change", () => {
    status.textContent = "Saving…";
    void onChoose(select.value).then((ok) => {
      // ok: false = the folder vanished between listing and choosing; the
      // background changed nothing (messages.ts). Copy is extension-authored.
      status.textContent = ok ? "Saved." : "That folder is gone — choose another.";
    });
  });

  return block;
}
