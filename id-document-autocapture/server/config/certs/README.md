# Self-signed certificate generation for demo-doc

Install openssl and execute:

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -subj '/CN=demo-doc' -config openssl.cnf -extensions v3_req -nodes
```

Then import your private key and certificate into a PKCS#12 keystore file:

```bash
openssl pkcs12 -export -out demo-doc.p12 -inkey key.pem -in cert.pem
```

**Note**: This configuration is for development only. In production, you must obtain your server certificate from a public trusted authority and use a domain name you own.
