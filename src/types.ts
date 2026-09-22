export interface Word {
  code: string;
  uthmani: string;
  verseKey: string;
  pos: number;
  type: 'word' | 'end';
}

export interface Line {
  line: number;
  type: 'text' | 'surah_name' | 'basmalah';
  centered: boolean;
  words: Word[];
  surah?: number;
  name?: string | null;
  code?: string;
}

export interface PageData {
  page: number;
  lines: Line[];
  verses: string[];
  source: string;
}

export interface Chapter {
  id: number;
  name_complex: string;
  name_arabic: string;
  translated_name: string;
  verses_count: number;
  pages: [number, number];
}
