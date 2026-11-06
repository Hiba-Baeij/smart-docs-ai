import { MAX_UPLOAD_BYTES, validateSelectedFile } from './file-selection';

describe('validateSelectedFile', () => {
  it('accepts PDF, DOCX and XLSX names regardless of extension case', () => {
    for (const name of ['report.PDF', 'notes.docx', 'table.XLSX']) {
      expect(validateSelectedFile(new File(['content'], name))).toBeNull();
    }
  });

  it('rejects unsupported, empty and oversized files before upload', () => {
    expect(validateSelectedFile(new File(['x'], 'photo.png'))).toBe('unsupported');
    expect(validateSelectedFile(new File([], 'empty.pdf'))).toBe('empty');
    const large = new File(['x'], 'large.pdf');
    Object.defineProperty(large, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    expect(validateSelectedFile(large)).toBe('too-large');
  });
});
