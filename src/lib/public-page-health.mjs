// Shared by Owner diagnostics and scheduled public monitoring. Never returns HTML.
export async function publicPageHealth(response) {
  if (!response.ok) { await response.body?.cancel(); return {ok:false,reason:'http_error'}; }
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    await response.body?.cancel();return {ok:false,reason:'unexpected_content'};
  }
  const reader=response.body?.getReader();
  if(!reader)return {ok:false,reason:'empty_document'};
  const decoder=new TextDecoder();let html='',bytes=0;
  try {
    while(true){
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;
      if(bytes>2*1024*1024){await reader.cancel();return {ok:false,reason:'document_limit'};}
      html+=decoder.decode(value,{stream:true});
    }
    html+=decoder.decode();
  } finally { reader.releaseLock(); }
  // Next's streamed error records can follow an otherwise successful HTML shell.
  // JSON string encoding inside the bootstrap script escapes quote characters.
  const normalised=html.replaceAll('\\"','"');
  const records=[...normalised.matchAll(/:E\{"digest":"([^"\r\n]*)/g)];
  if(records.some(match=>!match[1].startsWith('NEXT_REDIRECT;'))||
    /id=["']__next_error__["']|data-next-error(?:=|\s|>)/i.test(html))
    return {ok:false,reason:'render_error'};
  if(!/<main(?:\s|>)/i.test(html))return {ok:false,reason:'missing_main'};
  return {ok:true,reason:'document_received'};
}
