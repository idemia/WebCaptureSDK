# Self-signed certificate with multiple domain names

Configure the `[alt_names]` section in `openssl.cnf` and then:

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 36500 -subj '/CN=bioserver-video' -config openssl.cnf -extensions v3_req -nodes
```
