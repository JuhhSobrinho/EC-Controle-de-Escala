/* ── TecnicoModel: acesso à tabela `tecnicos` no Supabase ── */
var TecnicoModel = {
  TABLE: 'tecnicos',

  async fetchAll(){
    var res = await supabaseClient.from(this.TABLE).select('*').order('id');
    if(res.error) throw res.error;
    return res.data;
  },

  async create(payload){
    var res = await supabaseClient.from(this.TABLE).insert(payload).select().single();
    if(res.error) throw res.error;
    return res.data;
  },

  async update(id, payload){
    var res = await supabaseClient.from(this.TABLE).update(payload).eq('id', id).select().single();
    if(res.error) throw res.error;
    return res.data;
  },

  async remove(id){
    var res = await supabaseClient.from(this.TABLE).delete().eq('id', id);
    if(res.error) throw res.error;
  }
};
