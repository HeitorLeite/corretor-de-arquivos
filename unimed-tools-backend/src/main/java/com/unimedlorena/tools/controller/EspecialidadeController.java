package com.unimedlorena.tools.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimedlorena.tools.service.EspecialidadeService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/bi")
@CrossOrigin(origins = "http://localhost:4200")
public class EspecialidadeController {

    private final EspecialidadeService svc;
    private final ObjectMapper mapper = new ObjectMapper();

    public EspecialidadeController(EspecialidadeService svc) { this.svc = svc; }

    /**
     * POST /api/bi/especialidade
     * Parts: despesas (xlsx ou csv), medicos (xlsx)
     * Returns: arquivo xlsx corrigido + header X-Stats com JSON de estatísticas
     */
    @PostMapping("/especialidade")
    public ResponseEntity<byte[]> processar(
            @RequestParam("despesas") MultipartFile despesas,
            @RequestParam("medicos")  MultipartFile medicos) {
        try {
            var resultado = svc.processar(despesas, medicos);

            String statsJson = mapper.writeValueAsString(resultado.stats());
            String nomeArq   = despesas.getOriginalFilename() != null
                ? despesas.getOriginalFilename().replaceAll("\\.(xlsx|csv)$", "_PREENCHIDO.xlsx")
                : "despesas_PREENCHIDO.xlsx";

            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nomeArq + "\"")
                .header("X-Stats", statsJson)
                .header("Access-Control-Expose-Headers", "X-Stats")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(resultado.arquivo());

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                .body(("{\"message\":\"" + e.getMessage() + "\"}").getBytes());
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                .body(("{\"message\":\"Erro interno: " + e.getMessage() + "\"}").getBytes());
        }
    }
}
