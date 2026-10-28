// Render a groff document to PDF: the same path the server will use, from a shell.
//
//   deno run --allow-read --allow-env --allow-run=groff --allow-write \
//     server/cli/groff.js groff/examples/buttermilk-pancakes.ms /tmp/out.pdf
//
// The document goes through the same guard as the server's, so this cannot be
// used to render something the web app would refuse. groff is spawned with an
// argv array and the document arrives on stdin (see server/groff/render.js).

import { GroffDocumentError, renderPdf } from "../groff/render.js";

const [sourcePath, outPath] = Deno.args;

if (!sourcePath) {
  console.error("usage: deno run --allow-read --allow-env --allow-run=groff --allow-write \\");
  console.error("         server/cli/groff.js <document.ms> [out.pdf]");
  Deno.exit(2);
}

const output = outPath ?? sourcePath.replace(/\.[^.]+$/, "") + ".pdf";
const source = await Deno.readTextFile(sourcePath);

try {
  const { pdf, warnings } = await renderPdf(source);
  for (const w of warnings) console.error(`warning: ${w}`);
  await Deno.writeFile(output, pdf);
  console.log(
    `${output}: ${pdf.length} bytes${warnings.length ? `, ${warnings.length} warning(s)` : ""}`,
  );
} catch (err) {
  if (err instanceof GroffDocumentError) {
    // A refused document is not a crash: say which line and why, and exit 1.
    console.error(`refused: ${err.message}`);
    Deno.exit(1);
  }
  throw err;
}
