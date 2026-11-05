export const MODEL_REPO = 'pfnet/plamo-3-translate-0.8b-GGUF';
export const MODEL_FILE = 'plamo-3-translate-0.8b-Q4_K_M.gguf';
export const STOP_TOKENS = ['<|plamo:tag|>', '<|plamo:bos|>'];
function safe(value, label, max = 2500) {
  const result = String(value ?? '').trim();
  if (result.length > max) throw Error(label + 'が長すぎます（上限' + max + '文字）');
  if (result.includes('<|plamo:')) throw Error(label + 'に制御トークンは使用できません');
  return result;
}
export function parseGlossary(raw) {
  const lines = String(raw ?? '').split(String.fromCharCode(10)).map(s => s.replace(String.fromCharCode(13),'').trim()).filter(Boolean);
  if (lines.length > 20) throw Error('用語集は最大20行です');
  return lines.map((line, index) => {
    const pos = line.search(/[=→]/);
    if (pos <= 0 || pos >= line.length - 1) throw Error('用語集の' + (index + 1) + '行目は 原語=訳語 にしてください');
    return {source:safe(line.slice(0,pos),'用語集の原語',80),target:safe(line.slice(pos+1),'用語集の訳語',80)};
  });
}
export function buildPFML3({source, sourceLang, targetLang, context='', glossary=[], form='polite'}) {
  if (!['ja','en'].includes(sourceLang) || !['ja','en'].includes(targetLang) || sourceLang === targetLang) throw Error('言語の指定が不正です');
  if (targetLang === 'ja' && !['polite','plain'].includes(form)) throw Error('文体の指定が不正です');
  const text = safe(source, '原文');
  if (!text) throw Error('原文を入力してください');
  let prompt = '<|plamo:tag|>dataset<|plamo:msg|>translation';
  const reference = safe(context,'補足文脈');
  if (reference) prompt += '<|plamo:tag|>context<|plamo:msg|>' + reference;
  if (glossary.length) {
    prompt += '<|plamo:tag|>glossary';
    for (const pair of glossary) {
      const from = safe(pair.source,'原語',80), to = safe(pair.target,'訳語',80);
      if (!from || !to) throw Error('用語集に空の項目があります');
      prompt += '<|plamo:index|>' + from + '<|plamo:item|>' + to;
    }
  }
  prompt += '<|plamo:tag|>input<|plamo:key|>lang<|plamo:val|>' + sourceLang + '<|plamo:msg|>' + text;
  prompt += '<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>' + targetLang;
  if (targetLang === 'ja') prompt += '<|plamo:key|>form<|plamo:val|>' + form;
  return prompt + '<|plamo:msg|>';
}
