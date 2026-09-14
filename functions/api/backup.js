import { db, json, missingDb, requireAdmin } from "../_lib.js";
export async function onRequestGet({request,env}) {
  if (!(await requireAdmin(request,env))) return json({error:"需要管理员权限"},{status:403});
  const database=db(env); if(!database) return missingDb();
  const tables=["quotes","tasks","status_log","review_subjects","review_days","blog_posts","timetable_courses","chat_settings","chat_messages"];
  const existing=await database.prepare("select name from sqlite_master where type = 'table'").all();
  const names=new Set((existing.results||[]).map(row=>row.name));
  const selected=tables.filter(name=>names.has(name));
  const results=await database.batch(selected.map(name=>database.prepare("select * from "+name)));
  return json({format:"shunliuzx-backup",version:1,exportedAt:new Date().toISOString(),tables:Object.fromEntries(selected.map((name,i)=>[name,results[i].results||[]]))});
}
