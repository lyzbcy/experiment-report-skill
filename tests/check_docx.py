"""Validate rendered report semantics in OOXML, not just element presence."""
import sys
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'm': 'http://schemas.openxmlformats.org/officeDocument/2006/math'}
def val(e):
    return e.get('{'+ns['w']+'}val')
with ZipFile(sys.argv[1]) as z:
    doc = ET.fromstring(z.read('word/document.xml'))
    nums = ET.fromstring(z.read('word/numbering.xml'))
    settings = ET.fromstring(z.read('word/settings.xml'))
    styles = ET.fromstring(z.read('word/styles.xml'))
    for ident, level in [('Heading1', '0'), ('Heading2', '1')]:
        matches = [e for e in styles.findall('w:style', ns) if e.get('{'+ns['w']+'}styleId') == ident]
        assert len(matches) == 1, 'Do not duplicate built-in heading styles'
        style = matches[0]
        assert val(style.find('w:pPr/w:outlineLvl', ns)) == level, 'TOC needs outline levels'
    abstract = {e.get('{'+ns['w']+'}abstractNumId'): e for e in nums.findall('w:abstractNum', ns)}
    numbering = {e.get('{'+ns['w']+'}numId'): e for e in nums.findall('w:num', ns)}
    lists, headings, captions, references = {}, [], [], []
    for p in doc.findall('.//w:p', ns):
        text = ''.join(t.text or '' for t in p.findall('.//w:t', ns))
        num = p.find('w:pPr/w:numPr/w:numId', ns)
        if text.startswith('目标') or text.startswith('改进'):
            assert num is not None
            lists.setdefault(text[:2], set()).add(val(num))
        if p.find('w:pPr/w:pStyle', ns) is not None and val(p.find('w:pPr/w:pStyle', ns)) in ('Heading1', 'Heading2'):
            assert num is not None, text
            headings.append(p)
        if text.startswith('图 '): captions.append(text.split()[1])
        if text.startswith('见图 '): references.append(text.split()[1].split('：')[0])
        if text == '模板回归测试正文':
            assert val(p.find('w:pPr/w:spacing', ns)) is None  # spacing uses w:line, not w:val
            assert p.find('w:pPr/w:spacing', ns).get('{'+ns['w']+'}line') == '360'
            assert p.find('w:pPr/w:ind', ns).get('{'+ns['w']+'}firstLine') == '420'
            r = p.find('w:r/w:rPr', ns)
            assert val(r.find('w:sz', ns)) == '21'
            assert r.find('w:rFonts', ns).get('{'+ns['w']+'}eastAsia') == '宋体'
    assert lists['目标'].isdisjoint(lists['改进'])
    for ids in lists.values():
        for n in ids:
            item = numbering[n]
            aid = val(item.find('w:abstractNumId', ns))
            assert val(abstract[aid].find('w:lvl/w:start', ns)) == '1'
    assert len(headings) >= 10
    assert captions == references == ['1', '2', '3', '4']
    bases = []
    for sub in doc.findall('.//m:sSub', ns):
        base = ''.join(e.text or '' for e in sub.findall('m:e//m:t', ns))
        index = ''.join(e.text or '' for e in sub.findall('m:sub//m:t', ns))
        assert base and index, 'Empty subscript base'
        bases.append((base, index))
    assert ('x', 't−1') in bases and ('x', 't') in bases and ('c', 'text') in bases
    assert len(doc.findall('.//w:sectPr', ns)) == 3
    assert not doc.findall('.//w:br', ns), 'No redundant explicit page break'
    assert any('TOC' in (e.text or '') for e in doc.findall('.//w:instrText', ns))
    assert settings.find('w:updateFields', ns) is not None
print('DOCX semantic checks passed')
