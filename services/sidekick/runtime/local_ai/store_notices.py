"""Separately pinned public license transport; never used for model weights."""
from contextlib import contextmanager
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from .installer import allowed_url


def notice_url(url):
    if url=='https://www.apache.org/licenses/LICENSE-2.0.txt':return
    parsed=urlsplit(url)
    if (parsed.scheme=='https' and parsed.hostname=='raw.githubusercontent.com'
            and not parsed.username and not parsed.password and not parsed.fragment
            and parsed.port in (None,443) and len(parsed.path.split('/'))>=5
            and len(parsed.path.split('/')[3])==40):return
    allowed_url(url)


class NoticeTransport:
    @contextmanager
    def open(self,url,offset):
        notice_url(url)
        class Redirects(HTTPRedirectHandler):
            def redirect_request(self,req,fp,code,msg,headers,newurl):
                notice_url(newurl)
                return super().redirect_request(req,fp,code,msg,headers,newurl)
        headers={'Accept-Encoding':'identity','User-Agent':'Lastbrowser-pinned-notices/1'}
        if offset:headers['Range']=f'bytes={offset}-'
        with build_opener(ProxyHandler({}),Redirects()).open(Request(url,headers=headers),timeout=20) as response:
            notice_url(response.geturl())
            yield response
