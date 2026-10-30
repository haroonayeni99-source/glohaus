import {expect,it} from "vitest";
import {clientImportSchema,inferImportMapping,parseClientCsv,previewClientImport} from "@/modules/client-imports/domain";
const headers="name,email,import_permission,permission_date,permission_source";
const row={name:"Client",email:"client@example.test",import_permission:true,permission_date:"2026-01-01",permission_source:"Written client permission"};
it("parses quoted CSV, escaped quotes, BOM and CRLF without uploading",()=>{
 const parsed=parseClientCsv('\uFEFF'+headers+'\r\n"Client, ""A""",client@example.test,true,2026-01-01,Written permission\r\n');
 expect(parsed[1][0]).toBe('Client, "A"');expect(previewClientImport(parsed,inferImportMapping(parsed[0])).rows).toHaveLength(1);
});
it("rejects malformed and oversized files",()=>{
 for(const csv of [headers+'\n"unclosed',headers+'\na,b',headers+'\n"a"x,b,c,d,e',"x".repeat(524289)])expect(()=>parseClientCsv(csv)).toThrow();
});
it("requires explicit storage permission and evidence, not marketing opt-in",()=>{
 expect(clientImportSchema.safeParse({rows:[row],confirmed:true}).success).toBe(true);
 for(const patch of [{import_permission:false},{permission_date:"2099-01-01"},{permission_date:"2026-02-30"},{permission_source:""},{marketing_consent:true}])expect(clientImportSchema.safeParse({rows:[{...row,...patch}],confirmed:true}).success).toBe(false);
 expect(clientImportSchema.safeParse({rows:[row],confirmed:false}).success).toBe(false);
});
it("rejects duplicate normalized addresses and private extra fields",()=>{
 expect(clientImportSchema.safeParse({rows:[row,{...row,email:" CLIENT@example.test "}],confirmed:true}).success).toBe(false);
 expect(clientImportSchema.safeParse({rows:[{...row,medical_notes:"private"}],confirmed:true}).success).toBe(false);
});
it("skips unmapped fields and reports row errors without exposing customer values",()=>{
 const csv=parseClientCsv(headers+',medical_notes\nClient,client@example.test,false,2026-01-01,Written permission,secret');
 const preview=previewClientImport(csv,inferImportMapping(csv[0]));expect(preview.rows).toHaveLength(0);expect(preview.errors[0].row).toBe(2);expect(JSON.stringify(preview.errors)).not.toContain("secret");
 expect(()=>previewClientImport(csv,["name","email","email","permission_date","permission_source",""])).toThrow();
});
