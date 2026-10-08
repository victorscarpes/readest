/*
 * acj_transcode.c — lossless arithmetic-JPEG -> baseline-Huffman-JPEG transcode.
 *
 * This is the `jpegtran` coefficient path: read the DCT coefficients out of an
 * arithmetic-coded source (libjpeg-turbo's arithmetic decoder is compiled in by
 * default) and write the *same* coefficients back with Huffman coding. No pixel
 * buffer is ever allocated, so the result is bit-exact.
 *
 * A progressive-arithmetic source (SOF10, what `mozjpeg jpegtran -arithmetic`
 * and FileOptimizer emit) is written back as baseline sequential: the default
 * compress object is non-progressive and jpeg_write_coefficients honours that.
 *
 * SOF11 (arithmetic *lossless* mode) and 12-bit sources are not handled by the
 * coefficient path; jpeg_read_coefficients raises an error, we longjmp out and
 * return NULL. The JS caller then leaves the original bytes in place.
 */

#include <stdint.h>
#include <stdio.h> /* libjpeg's jpeglib.h requires stdio.h (FILE) to precede it */
#include <stdlib.h>
#include <setjmp.h>

#include "jpeglib.h"

#include <emscripten.h>

struct acj_error_mgr {
  struct jpeg_error_mgr pub;
  jmp_buf setjmp_buffer;
};

static void acj_error_exit(j_common_ptr cinfo) {
  struct acj_error_mgr *err = (struct acj_error_mgr *)cinfo->err;
  longjmp(err->setjmp_buffer, 1);
}

/* Swallow libjpeg's warnings/trace output (default writes to stderr). */
static void acj_emit_message(j_common_ptr cinfo, int msg_level) {
  (void)cinfo;
  (void)msg_level;
}

/*
 * Transcode `in`/`in_len` to a baseline Huffman JPEG.
 *
 * On success: returns a malloc'd buffer and writes its length to *out_len.
 *             The caller owns the buffer and must free it with free() (_free).
 * On failure: returns NULL (and *out_len is left untouched).
 */
EMSCRIPTEN_KEEPALIVE
uint8_t *acj_transcode(const uint8_t *in, size_t in_len, size_t *out_len) {
  struct jpeg_decompress_struct srcinfo;
  struct jpeg_compress_struct dstinfo;
  struct acj_error_mgr srcerr, dsterr;

  unsigned char *outbuffer = NULL;
  unsigned long outsize = 0;
  jvirt_barray_ptr *coef_arrays = NULL;

  int src_created = 0, dst_created = 0;

  srcinfo.err = jpeg_std_error(&srcerr.pub);
  srcerr.pub.error_exit = acj_error_exit;
  srcerr.pub.emit_message = acj_emit_message;

  dstinfo.err = jpeg_std_error(&dsterr.pub);
  dsterr.pub.error_exit = acj_error_exit;
  dsterr.pub.emit_message = acj_emit_message;

  if (setjmp(srcerr.setjmp_buffer) || setjmp(dsterr.setjmp_buffer)) {
    if (dst_created) jpeg_destroy_compress(&dstinfo);
    if (src_created) jpeg_destroy_decompress(&srcinfo);
    if (outbuffer) free(outbuffer);
    return NULL;
  }

  jpeg_create_decompress(&srcinfo);
  src_created = 1;
  jpeg_mem_src(&srcinfo, in, in_len);
  jpeg_read_header(&srcinfo, TRUE);

  /* Decodes the entropy-coded stream (arithmetic or Huffman) into coefficients. */
  coef_arrays = jpeg_read_coefficients(&srcinfo);

  jpeg_create_compress(&dstinfo);
  dst_created = 1;
  jpeg_copy_critical_parameters(&srcinfo, &dstinfo);

  /* Force plain baseline output that every webview can decode. */
  dstinfo.arith_code = FALSE;      /* Huffman, not arithmetic. */
  dstinfo.optimize_coding = TRUE;  /* Optimised Huffman tables (smaller). */

  jpeg_mem_dest(&dstinfo, &outbuffer, &outsize);
  jpeg_write_coefficients(&dstinfo, coef_arrays);

  jpeg_finish_compress(&dstinfo);
  jpeg_destroy_compress(&dstinfo);
  dst_created = 0;

  jpeg_finish_decompress(&srcinfo);
  jpeg_destroy_decompress(&srcinfo);
  src_created = 0;

  *out_len = (size_t)outsize;
  return (uint8_t *)outbuffer;
}
