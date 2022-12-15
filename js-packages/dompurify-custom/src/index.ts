import * as DOMPurify from 'dompurify'
DOMPurify.addHook('afterSanitizeAttributes', function (node) {
    if (node.nodeName == 'A') {
        node.setAttribute('target', '_blank')
        let rel = node.getAttribute('rel') || ''
        if (!rel.includes('noopener')) {
            rel += ' noopener'
        }
        if (!rel.includes('noreferrer')) {
            rel += ' noreferrer'
        }
        node.setAttribute('rel', rel)
    }
    // set non-HTML/MathML links to xlink:show=new
    if (
        !node.hasAttribute('target') &&
        (node.hasAttribute('xlink:href') || node.hasAttribute('href'))
    ) {
        node.setAttribute('xlink:show', 'new')
    }
})

export default DOMPurify
