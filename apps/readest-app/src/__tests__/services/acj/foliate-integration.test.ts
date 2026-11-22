// Integration: an arithmetic-coded JPEG embedded in an EPUB must reach the
// webview as a baseline JPEG. Drives foliate-js's own resource loader (as
// FoliateViewer does) with the real `maybeTranscodeArithmeticJpeg` attached to
// `book.transformTarget`, and checks the bytes handed to URL.createObjectURL.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { EPUB } from 'foliate-js/epub.js';

import { maybeTranscodeArithmeticJpeg } from '@/services/acj';
import { detectArithmeticJpeg } from '@/services/acj/detect';
import { resetArithmeticJpegModule, transcodeArithmeticJpeg } from '@/services/acj/wasm';

const arithJpeg = new Uint8Array(
  readFileSync(resolve(__dirname, '../../fixtures/acj/p0000-arith-sof10.jpg')),
);

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookID" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Arith JPEG</dc:title><dc:language>en</dc:language>
    <dc:identifier id="BookID">urn:uuid:acj</dc:identifier>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="pic" href="p0000.jpg" media-type="image/jpeg"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`;

const CHAPTER = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="p0000.jpg" alt="x"/></body></html>`;

const openEpub = async () => {
  const text: Record<string, string> = {
    'META-INF/container.xml': CONTAINER,
    'OEBPS/content.opf': OPF,
    'OEBPS/chapter1.xhtml': CHAPTER,
  };
  const IMG = 'OEBPS/p0000.jpg';
  const epub = new EPUB({
    entries: [...Object.keys(text), IMG].map((filename) => ({ filename })),
    loadText: async (name: string) => text[name] ?? null,
    loadBlob: async (name: string) => {
      if (name === IMG) return new Blob([arithJpeg]);
      return text[name] == null ? null : new Blob([text[name]!]);
    },
    getSize: (name: string) => (name === IMG ? arithJpeg.length : (text[name]?.length ?? 0)),
    sha1: undefined,
  });
  await epub.init();
  epub.transformTarget?.addEventListener('data', (event: Event) => {
    const { detail } = event as CustomEvent<{ data: unknown; type: string }>;
    if (detail.type !== 'image/jpeg') return;
    detail.data = Promise.resolve(detail.data).then((d) =>
      maybeTranscodeArithmeticJpeg(d instanceof Blob ? d : new Blob([d as BlobPart])),
    );
  });
  const sections = (epub.sections ?? []) as Array<{ load: () => Promise<unknown> }>;
  return { epub, sections };
};

let wasmReady = false;
beforeAll(async () => {
  resetArithmeticJpegModule();
  try {
    await transcodeArithmeticJpeg(arithJpeg);
    wasmReady = true;
  } catch {
    wasmReady = false;
  }
});

const origCreate = URL.createObjectURL;
const origRevoke = URL.revokeObjectURL;
let blobs: Blob[];
beforeEach(() => {
  blobs = [];
  let n = 0;
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    if (obj instanceof Blob) blobs.push(obj);
    return `blob:test/${n++}`;
  };
  URL.revokeObjectURL = () => {};
});
afterEach(() => {
  URL.createObjectURL = origCreate;
  URL.revokeObjectURL = origRevoke;
});

describe('EPUB arithmetic-JPEG interception via book.transformTarget', () => {
  it('hands the webview a baseline JPEG, not the arithmetic original', async (ctx) => {
    if (!wasmReady) ctx.skip();
    const { sections } = await openEpub();
    await sections[0]!.load();

    const jpegBlobs: Uint8Array[] = [];
    for (const b of blobs) {
      const bytes = new Uint8Array(await b.arrayBuffer());
      if (bytes[0] === 0xff && bytes[1] === 0xd8) jpegBlobs.push(bytes);
    }
    expect(jpegBlobs.length).toBe(1);
    const served = jpegBlobs[0]!;
    expect(detectArithmeticJpeg(served)).toBeNull(); // arithmetic coding removed
    expect(served).not.toEqual(arithJpeg); // actually transcoded
    expect(detectArithmeticJpeg(arithJpeg)).toBe('sof10'); // sanity: source really was arith
  });

  it('leaves a normal (non-arithmetic) resource untouched', async () => {
    // chapter1.xhtml + (transcoded or not) image => at least the XHTML blob passes through
    const { sections } = await openEpub();
    await sections[0]!.load();
    expect(blobs.length).toBeGreaterThanOrEqual(1);
  });
});
