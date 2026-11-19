import { Fragment } from "react";

/**
 * Renders assistant text safely: paragraphs, "- " lists and **bold** only. No
 * HTML is ever interpreted, so nothing in a message can inject markup.
 */
function inline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={`${keyBase}-${i}`} className="font-extrabold">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={`${keyBase}-${i}`}>{p}</Fragment>
    ),
  );
}

export function MessageText({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="grid gap-2.5">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim().length);
        const isList = lines.length > 0 && lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="grid gap-1">
              {lines.map((l, li) => (
                <li key={li} className="tnum flex gap-2">
                  <span className="mt-[10px] h-[2px] w-2 shrink-0 bg-ink-2" aria-hidden />
                  <span>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), `${bi}-${li}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="tnum">
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
