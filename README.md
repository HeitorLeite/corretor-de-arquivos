# corretor-de-arquivos
Essa aplicação funcionará para uso local da UNIMED Lorena, onde os colaboradores poderão arrumar erros de seus arquivos XLSX, XML, TXT, etc.

## Deploy no Render

O repositório já está preparado para publicar:

- Backend Spring Boot como Web Service
- Frontend Angular como Static Site

### Arquivos adicionados
- [unimed-tools-backend/Dockerfile](unimed-tools-backend/Dockerfile)
- [unimed-tools-backend/src/main/resources/application.properties](unimed-tools-backend/src/main/resources/application.properties)
- [archive-corrector/src/environments/environment.ts](archive-corrector/src/environments/environment.ts)
- [archive-corrector/src/environments/environment.prod.ts](archive-corrector/src/environments/environment.prod.ts)
- [render.yaml](render.yaml)

### Como publicar
1. Conecte este repositório no Render.
2. O Render irá ler o arquivo [render.yaml](render.yaml) e criar os serviços automaticamente.
3. O frontend usará a API em [archive-corrector/src/environments/environment.prod.ts](archive-corrector/src/environments/environment.prod.ts).
4. O backend expõe o endpoint de saúde em /health para checagem do Render.
