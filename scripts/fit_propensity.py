import pandas as pd, numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
d=pd.read_csv('data/smb_leads.csv'); y=(d.outcome=='Activated').astype(int).values
X=pd.DataFrame({
 'gstin':(d.has_gstin=='Y')*1,
 'udyam':(d.has_udyam=='Y')*1,
 'tier1':(d.city_tier==1)*1,
 'nonmicro':(d.segment!='Micro retail & services')*1,
 'src_referral':(d.lead_source=='Referral')*1,
 'src_inbound':(d.lead_source=='Inbound call')*1,
 'src_web':(d.lead_source=='Website form')*1,
 'src_wa':(d.lead_source=='WhatsApp campaign')*1,
 'bigger':((d.employee_count>10)|d.annual_turnover_band.isin(['5 - 25 cr','25 - 100 cr']))*1,
 'hotspot':(d.current_internet=='Mobile hotspot')*1,
 'leased':d.current_internet.isin(['Leased line','Mixed per site'])*1,
 'prov_local':(d.current_provider=='Local ISP')*1,
})
m=LogisticRegression(C=10,max_iter=3000).fit(X,y)
print(round(m.intercept_[0],2))
for c,w in zip(X.columns,m.coef_[0]):print(c,round(w,2), round(y[X[c]==1].mean(),3), round(y[X[c]==0].mean(),3), int(X[c].sum()))
print(roc_auc_score(y,m.decision_function(X)))
