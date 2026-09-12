from pypdf import PdfReader

reader = PdfReader('/home/ubuntu/upload/ds.pdf')
for page_number, page in enumerate(reader.pages, start=1):
    annotations = page.get('/Annots') or []
    for annotation_ref in annotations:
        annotation = annotation_ref.get_object()
        action = annotation.get('/A')
        uri = action.get('/URI') if action else None
        if uri:
            print(f'page={page_number}\t{uri}')
