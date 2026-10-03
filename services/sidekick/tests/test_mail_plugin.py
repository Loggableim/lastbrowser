import tempfile,sys,json,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from web.api import mail_plugin as mail
class MailIsolationTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.home=patch.object(mail,'get_webui_home',return_value=Path(self.temp.name));self.home.start()
 def tearDown(self): self.home.stop();self.temp.cleanup()
 def account(self,email):return {'id':'test','email':email,'provider':'gmail','password':'local-'+'fixture-secret'}
 def test_space_isolation_and_encrypted_persistence(self):
  mail.save('space-A',{'enabled':True,'account':self.account('a@example.com')});mail.save('space-B',{'enabled':True,'account':self.account('b@example.com')})
  self.assertEqual(mail.settings('space-A','test')['email'],'a@example.com');self.assertEqual(mail.settings('space-B','test')['email'],'b@example.com')
  self.assertNotIn('password',mail.load('space-A')['accounts']['test']);self.assertNotIn('fixture-secret',mail._path('space-A').read_text())
  with self.assertRaises(ValueError):mail.settings('space-C','test')
 def test_disable_does_not_fallback_to_other_space(self):
  mail.save('A',{'enabled':True,'account':self.account('a@example.com')});mail.save('A',{'enabled':False})
  with self.assertRaises(ValueError):mail.settings('A','test')
 def test_blank_password_preserves_encrypted_secret(self):
  mail.save('A',{'enabled':True,'account':self.account('a@example.com')});mail.save('A',{'account':{**self.account('a@example.com'),'password':''}})
  self.assertEqual(mail.settings('A','test')['password'],'local-'+'fixture-secret')
 def test_generic_tls_settings(self):
  cfg={**self.account('a@example.com'),'provider':'imap','imap_host':'imap.example.com','imap_port':993,'imap_security':'ssl','smtp_host':'smtp.example.com','smtp_port':587,'smtp_security':'starttls'}
  mail.save('A',{'enabled':True,'account':cfg});self.assertEqual(mail.settings('A','test')['imap_host'],'imap.example.com')
  cfg['smtp_security']='none'
  with self.assertRaises(ValueError):mail.save('A',{'account':cfg})
if __name__=='__main__':unittest.main()
