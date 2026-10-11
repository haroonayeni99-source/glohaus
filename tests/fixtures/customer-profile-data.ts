export async function withIdentity<T>(_authId:string,work:(db:never)=>Promise<T>){return work({} as never);}
export async function customerProfile(){return {first_name:"",last_name:"",has_photo:false};}
