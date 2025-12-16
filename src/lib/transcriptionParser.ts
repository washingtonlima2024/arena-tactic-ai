// Multi-format transcription parser with event detection

export interface TranscriptionLine {
  start: number; // seconds
  end: number; // seconds
  text: string;
  lineNumber: number;
  hasTimestamp: boolean;
  isValid: boolean;
}

export interface DetectedEvent {
  type: 'goal' | 'foul' | 'card' | 'penalty' | 'substitution' | 'other';
  timestamp: number;
  text: string;
  confidence: number;
}

export interface ParseResult {
  lines: TranscriptionLine[];
  format: 'srt' | 'vtt' | 'txt' | 'json' | 'unknown';
  totalLines: number;
  validLines: number;
  startTime: number | null;
  endTime: number | null;
  coveragePercent: number;
  detectedEvents: DetectedEvent[];
  rawText: string;
}

// Detect format from content
export function detectFormat(content: string): 'srt' | 'vtt' | 'txt' | 'json' | 'unknown' {
  const trimmed = content.trim();
  
  // JSON format
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }
  
  // VTT format
  if (trimmed.startsWith('WEBVTT')) {
    return 'vtt';
  }
  
  // SRT format - starts with number and has --> arrows
  if (/^\d+\s*\n\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/m.test(trimmed)) {
    return 'srt';
  }
  
  // TXT format - has timestamp separators
  if (/\[\d{2}:\d{2}(:\d{2})?\]|\d{2}:\d{2}(:\d{2})?\s*\|/.test(trimmed)) {
    return 'txt';
  }
  
  return 'unknown';
}

// Parse SRT format
export function parseSRT(content: string): TranscriptionLine[] {
  const lines: TranscriptionLine[] = [];
  const blocks = content.trim().split(/\n\n+/);
  
  for (const block of blocks) {
    const blockLines = block.split('\n');
    if (blockLines.length < 2) continue;
    
    // Find timestamp line (skip index)
    let timestampLine = '';
    let textLines: string[] = [];
    
    for (let i = 0; i < blockLines.length; i++) {
      if (blockLines[i].includes('-->')) {
        timestampLine = blockLines[i];
        textLines = blockLines.slice(i + 1);
        break;
      }
    }
    
    if (!timestampLine) continue;
    
    const match = timestampLine.match(/(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})/);
    if (!match) continue;
    
    const start = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
    const end = parseInt(match[5]) * 3600 + parseInt(match[6]) * 60 + parseInt(match[7]) + parseInt(match[8]) / 1000;
    
    lines.push({
      start,
      end,
      text: textLines.join(' ').trim(),
      lineNumber: lines.length + 1,
      hasTimestamp: true,
      isValid: true,
    });
  }
  
  return lines;
}

// Parse VTT format
export function parseVTT(content: string): TranscriptionLine[] {
  // Remove WEBVTT header and notes
  const cleanContent = content.replace(/^WEBVTT.*\n/, '').replace(/NOTE.*\n/g, '');
  return parseSRT(cleanContent);
}

// Parse TXT format with various timestamp patterns
export function parseTXT(content: string): TranscriptionLine[] {
  const lines: TranscriptionLine[] = [];
  const rawLines = content.split('\n');
  
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;
    
    // Pattern 1: [00:01:30] text
    let match = line.match(/^\[(\d{2}):(\d{2})(?::(\d{2}))?\]\s*(.+)$/);
    if (match) {
      const hours = match[3] ? parseInt(match[1]) : 0;
      const minutes = match[3] ? parseInt(match[2]) : parseInt(match[1]);
      const seconds = match[3] ? parseInt(match[3]) : parseInt(match[2]);
      const start = hours * 3600 + minutes * 60 + seconds;
      
      lines.push({
        start,
        end: start + 5, // Estimate 5 seconds
        text: match[4].trim(),
        lineNumber: i + 1,
        hasTimestamp: true,
        isValid: true,
      });
      continue;
    }
    
    // Pattern 2: 00:01:30 | text
    match = line.match(/^(\d{2}):(\d{2})(?::(\d{2}))?\s*\|\s*(.+)$/);
    if (match) {
      const hours = match[3] ? parseInt(match[1]) : 0;
      const minutes = match[3] ? parseInt(match[2]) : parseInt(match[1]);
      const seconds = match[3] ? parseInt(match[3]) : parseInt(match[2]);
      const start = hours * 3600 + minutes * 60 + seconds;
      
      lines.push({
        start,
        end: start + 5,
        text: match[4].trim(),
        lineNumber: i + 1,
        hasTimestamp: true,
        isValid: true,
      });
      continue;
    }
    
    // Pattern 3: 1:30 text (minutes:seconds)
    match = line.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
    if (match) {
      const start = parseInt(match[1]) * 60 + parseInt(match[2]);
      lines.push({
        start,
        end: start + 5,
        text: match[3].trim(),
        lineNumber: i + 1,
        hasTimestamp: true,
        isValid: true,
      });
      continue;
    }
    
    // No timestamp - add as text only
    lines.push({
      start: 0,
      end: 0,
      text: line,
      lineNumber: i + 1,
      hasTimestamp: false,
      isValid: true,
    });
  }
  
  return lines;
}

// Parse JSON format
export function parseJSON(content: string): TranscriptionLine[] {
  try {
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : data.segments || data.lines || [];
    
    return items.map((item: any, index: number) => ({
      start: item.start ?? item.startTime ?? 0,
      end: item.end ?? item.endTime ?? (item.start || 0) + 5,
      text: item.text ?? item.content ?? '',
      lineNumber: index + 1,
      hasTimestamp: item.start !== undefined || item.startTime !== undefined,
      isValid: !!item.text || !!item.content,
    }));
  } catch {
    return [];
  }
}

// Detect potential events in text
export function detectPotentialEvents(lines: TranscriptionLine[]): DetectedEvent[] {
  const events: DetectedEvent[] = [];
  
  const patterns: { type: DetectedEvent['type']; patterns: RegExp[]; confidence: number }[] = [
    {
      type: 'goal',
      patterns: [
        /go+l+/i,
        /goooo+l/i,
        /marcou/i,
        /é gol/i,
        /gol contra/i,
        /empate/i,
        /virou o jogo/i,
        /faz o (primeiro|segundo|terceiro|quarto)/i,
      ],
      confidence: 0.9,
    },
    {
      type: 'card',
      patterns: [
        /cart[ãa]o\s*(amarelo|vermelho)/i,
        /amarelo para/i,
        /vermelho para/i,
        /expuls[ãa]o/i,
        /foi expulso/i,
      ],
      confidence: 0.85,
    },
    {
      type: 'foul',
      patterns: [
        /falta\s*(de|para|no|na)/i,
        /falta perigosa/i,
        /entrada dura/i,
        /lance perigoso/i,
      ],
      confidence: 0.7,
    },
    {
      type: 'penalty',
      patterns: [
        /p[êe]nalti/i,
        /penalty/i,
        /marca[çc][ãa]o de p[êe]nalti/i,
        /marca o p[êe]nalti/i,
      ],
      confidence: 0.9,
    },
    {
      type: 'substitution',
      patterns: [
        /substitui[çc][ãa]o/i,
        /entrou\s+.+\s+saiu/i,
        /sai\s+.+\s+entra/i,
      ],
      confidence: 0.8,
    },
  ];
  
  for (const line of lines) {
    if (!line.text) continue;
    
    for (const { type, patterns: regexList, confidence } of patterns) {
      for (const regex of regexList) {
        if (regex.test(line.text)) {
          events.push({
            type,
            timestamp: line.start,
            text: line.text,
            confidence,
          });
          break;
        }
      }
    }
  }
  
  // Remove duplicates close in time
  return events.filter((event, index) => {
    const prevSame = events.findIndex(
      (e, i) => i < index && e.type === event.type && Math.abs(e.timestamp - event.timestamp) < 30
    );
    return prevSame === -1;
  });
}

// Main parse function
export function parseTranscription(content: string, videoDurationSeconds?: number): ParseResult {
  const format = detectFormat(content);
  let lines: TranscriptionLine[] = [];
  
  switch (format) {
    case 'srt':
      lines = parseSRT(content);
      break;
    case 'vtt':
      lines = parseVTT(content);
      break;
    case 'json':
      lines = parseJSON(content);
      break;
    case 'txt':
    case 'unknown':
      lines = parseTXT(content);
      break;
  }
  
  const validLines = lines.filter(l => l.isValid && l.hasTimestamp);
  const startTime = validLines.length > 0 ? Math.min(...validLines.map(l => l.start)) : null;
  const endTime = validLines.length > 0 ? Math.max(...validLines.map(l => l.end)) : null;
  
  let coveragePercent = 0;
  if (startTime !== null && endTime !== null && videoDurationSeconds) {
    coveragePercent = Math.min(100, ((endTime - startTime) / videoDurationSeconds) * 100);
  }
  
  const rawText = lines.map(l => l.text).join('\n');
  const detectedEvents = detectPotentialEvents(lines);
  
  return {
    lines,
    format,
    totalLines: lines.length,
    validLines: validLines.length,
    startTime,
    endTime,
    coveragePercent,
    detectedEvents,
    rawText,
  };
}

// Convert parsed lines back to SRT format
export function toSRT(lines: TranscriptionLine[]): string {
  return lines
    .filter(l => l.hasTimestamp)
    .map((line, index) => {
      const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
      };
      
      return `${index + 1}\n${formatTime(line.start)} --> ${formatTime(line.end)}\n${line.text}`;
    })
    .join('\n\n');
}

// Format timestamp for display
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
