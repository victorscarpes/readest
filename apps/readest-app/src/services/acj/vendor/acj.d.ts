/**
 * Type surface of the Emscripten module produced by `build.sh`
 * (`-sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createACJModule`).
 */

export interface ACJModule {
  /**
   * Lossless arithmetic-JPEG -> baseline-Huffman-JPEG transcode.
   *
   * @param inPtr     pointer into HEAPU8 holding the source JPEG
   * @param inLen     source length in bytes
   * @param outLenPtr pointer to a 4-byte slot that receives the output length
   * @returns pointer to a malloc'd baseline JPEG (free with `_free`), or 0 on failure
   */
  _acj_transcode(inPtr: number, inLen: number, outLenPtr: number): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  /** Emscripten heap views. Backed by a plain ArrayBuffer (no pthreads). */
  HEAPU8: Uint8Array<ArrayBuffer>;
  HEAPU32: Uint32Array<ArrayBuffer>;
}

export interface ACJModuleOptions {
  /** Override asset resolution. Unused with `-sSINGLE_FILE=1` but kept for safety. */
  locateFile?: (path: string, scriptDirectory: string) => string;
  print?: (msg: string) => void;
  printErr?: (msg: string) => void;
}

export default function createACJModule(options?: ACJModuleOptions): Promise<ACJModule>;
