/* ── EscalaModel: acesso à tabela `escala` no Supabase ──
   Colunas: id, tecnico_id, data (date), status (text), updated_at, folga_override (0/1/null) */
var EscalaModel = {
  TABLE: 'escala',
  PAGE_SIZE: 1000,

  async fetchAll(){
    var all = [], from = 0;
    while(true){
      var res = await supabaseClient.from(this.TABLE).select('*').range(from, from + this.PAGE_SIZE - 1);
      if(res.error) throw res.error;
      all = all.concat(res.data);
      if(res.data.length < this.PAGE_SIZE) break;
      from += this.PAGE_SIZE;
    }
    return all;
  },

  /* Grava um único dia. rowId null => insere linha nova; rowId existente => atualiza.
     patch pode conter status e/ou folga_override. Retorna a linha salva (com id). */
  async saveDay(tecnicoId, iso, rowId, patch){
    var payload = Object.assign({}, patch, {updated_at: new Date().toISOString()});
    if(rowId){
      var res = await supabaseClient.from(this.TABLE).update(payload).eq('id', rowId).select().single();
      if(res.error) throw res.error;
      return res.data;
    }
    var insertPayload = Object.assign({tecnico_id: tecnicoId, data: iso, status: ''}, payload);
    var res2 = await supabaseClient.from(this.TABLE).insert(insertPayload).select().single();
    if(res2.error) throw res2.error;
    return res2.data;
  },

  /* days: [{iso, rowId, patch}] — grava todos em paralelo. Retorna array de linhas salvas na mesma ordem. */
  async saveRange(tecnicoId, days){
    return Promise.all(days.map(function(d){
      return EscalaModel.saveDay(tecnicoId, d.iso, d.rowId, d.patch);
    }));
  }
};
