import pandas as pd, numpy as np
d=pd.read_csv('data/smb_leads.csv')
d['act']=(d.outcome=='Activated').astype(int)
order=['Lead','Contacted','Needs assessed','Quote accepted','KYC complete','Activated']
d['si']=d.stage_reached.map({s:i for i,s in enumerate(order)})
d['qa']=(d.si>=3).astype(int)
d['na']=(d.si>=2).astype(int)
d['con']=(d.si>=1).astype(int)
print(d.outcome.value_counts(), d.stage_reached.value_counts())
d['nprod']=d.products_of_interest.fillna('').str.split(';').apply(lambda x:len([i for i in x if i]))
d['spendb']=pd.qcut(d.monthly_telecom_spend_inr,4)
d['empb']=pd.cut(d.employee_count,[0,5,10,25,50,1000])
for c in ['has_gstin','has_udyam','segment','city_tier','lead_source','preferred_language','empb','num_sites','annual_turnover_band','current_internet','current_provider','spendb','nprod']:
    g=d.groupby(c,observed=True).agg(n=('act','size'),con=('con','mean'),na=('na','mean'),qa=('qa','mean'),act=('act','mean')).round(3)
    print('\n',c);print(g)
d['m']=d.created_date.str[:7]
print(d.groupby('m').act.agg(['size','mean']))
print(d.drop_reason.fillna('NA').groupby([d.stage_reached,d.drop_reason.fillna('NA')]).size())
a=d[d.act==1];print(a.days_lead_to_activation.describe(),a.customer_follow_up_calls.mean())
for c in ['contacted_date','needs_assessed_date','quote_accepted_date','kyc_complete_date','activated_date']:
    d[c+'_d']=(pd.to_datetime(d[c])-pd.to_datetime(d.created_date)).dt.days
print(d.groupby('stage_reached')[[c+'_d' for c in ['contacted_date','needs_assessed_date','quote_accepted_date','kyc_complete_date','activated_date']]].mean())
print(d.groupby('act')[['contacted_date_d','needs_assessed_date_d','quote_accepted_date_d']].mean())
# products
from collections import defaultdict
pp=defaultdict(lambda:[0,0])
for p,a_ in zip(d.products_of_interest.fillna(''),d.act):
    for x in p.split(';'):
        if x: pp[x][0]+=1;pp[x][1]+=a_
print(sorted([(k,v[0],round(v[1]/v[0],3)) for k,v in pp.items()],key=lambda t:-t[2]))
