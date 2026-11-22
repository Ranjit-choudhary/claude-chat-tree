// Minimal BERT "uncased" WordPiece tokenizer for all-MiniLM-L6-v2. No network.
export class WordPiece {
  constructor(vocabText) {
    this.vocab = new Map();
    vocabText.split("\n").forEach((tok, i) => { if (tok) this.vocab.set(tok.replace(/\r$/, ""), i); });
    this.unk = this.vocab.get("[UNK]"); this.cls = this.vocab.get("[CLS]"); this.sep = this.vocab.get("[SEP]");
  }
  basic(text) {
    // Lowercase, strip accents, split on whitespace and punctuation (as BERT's BasicTokenizer does).
    const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\u0000-\u001f]/g, " ");
    return t.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];
  }
  encode(text, maxLen) {
    const ids = [this.cls];
    for (const word of this.basic(text)) {
      if (word.length > 100) { ids.push(this.unk); continue; }
      let start = 0; const pieces = [];
      while (start < word.length) {
        let end = word.length, found = null;
        while (start < end) {
          const sub = (start > 0 ? "##" : "") + word.slice(start, end);
          if (this.vocab.has(sub)) { found = this.vocab.get(sub); break; }
          end--;
        }
        if (found == null) { pieces.length = 0; pieces.push(this.unk); break; }
        pieces.push(found); start = end;
      }
      ids.push(...pieces);
      if (ids.length >= maxLen - 1) break;
    }
    ids.length = Math.min(ids.length, maxLen - 1);
    ids.push(this.sep);
    return ids;
  }
}
