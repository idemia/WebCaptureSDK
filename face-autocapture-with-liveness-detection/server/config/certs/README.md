# Self-signed certificate generation for demo-server

Install openssl and execute:

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -subj '/CN=demo-server' -config openssl.cnf -extensions v3_req -nodes
```

Then import your private key and certificate into a PKCS#12 keystore file:

```bash
openssl pkcs12 -export -out demo-server.p12 -inkey key.pem -in cert.pem -keypbe AES-256-CBC -certpbe AES-256-CBC
```

Update the password of the keystore in ../secrets/tls_keystore_password.txt

**Note**: This configuration is for development only. In production, you must obtain your server certificate from a public trusted authority and use a domain name you own.
