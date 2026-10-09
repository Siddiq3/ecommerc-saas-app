import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TextInput, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { instagram, products } from '../api/endpoints.js';
import { Body, Button, Caption, Card, Row, Touchable } from './ui.jsx';
import { colors, space, radius, type } from '../theme.js';

const failure = (error) => {
  if (error?.code === 'INSTAGRAM_DISABLED') return 'Instagram connection is not enabled yet.';
  if (error?.code === 'INSTAGRAM_RECONNECT') return 'Instagram access expired. Disconnect and connect again.';
  if (error?.code === 'PLAN_LIMIT_EXCEEDED') return 'Your trial has ended. You can still disconnect or pause automations.';
  if (error?.code === 'INSTAGRAM_RULE_EXISTS') return 'This post already has a rule using that keyword.';
  if (error?.code === 'INSTAGRAM_PRODUCT_UNAVAILABLE') return 'Choose an active product.';
  return 'Something went wrong. Please try again.';
};

const StatusLine = ({ status }) => {
  const labels = { disconnected:'Not connected', connected:'Instagram connected',
    expired:'Access expired', reauthorization_required:'Reconnect required' };
  return <Row gap={space.sm} style={{ marginBottom:space.md }}>
    <Ionicons name={status==='connected'?'checkmark-circle-outline':'alert-circle-outline'}
      color={status==='connected'?colors.success:colors.warning} size={21} />
    <Body strong>{labels[status] ?? 'Checking Instagram'}</Body>
  </Row>;
};

const Choice = ({ chosen, title, subtitle, onPress, image }) => (
  <Touchable accessibilityLabel={title} onPress={onPress}
    style={{ padding:space.md, borderWidth:1, borderColor:chosen?colors.accent600:colors.line,
      backgroundColor:chosen?colors.accent50:colors.surface,borderRadius:radius.md,marginBottom:space.sm }}>
    <Row gap={space.md}>
      {image ? <Image source={{uri:image}} style={{width:45,height:45,borderRadius:radius.sm}}/> : null}
      <View style={{ flex:1 }}>
        <Body strong>{title}</Body>
        {subtitle?<Caption numberOfLines={2}>{subtitle}</Caption>:null}
      </View>
      {chosen?<Ionicons name="checkmark-circle" color={colors.accent600} size={20}/>:null}
    </Row>
  </Touchable>
);

export function InstagramPanel({ businessId }) {
  const [status,setStatus]=useState({status:'disconnected',enabled:false});
  const [media,setMedia]=useState([]);
  const [rules,setRules]=useState([]);
  const [catalog,setCatalog]=useState([]);
  const [report,setReport]=useState(null);
  const [selectedMedia,setSelectedMedia]=useState('');
  const [selectedProduct,setSelectedProduct]=useState('');
  const [keyword,setKeyword]=useState('LINK');
  const [loading,setLoading]=useState(Boolean(businessId));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [nextCursor,setNextCursor]=useState(null);

  const reload=useCallback(async()=>{
    if(!businessId){setLoading(false);return;}
    try {
      const current=await instagram.status(businessId);
      setStatus(current??{status:'disconnected',enabled:false});
      if(current?.status==='connected'&&current.enabled){
        const [r,m,p,a]=await Promise.allSettled([
          instagram.rules(businessId),instagram.media(businessId),
          products.list(businessId,{limit:50,active:'true'}),instagram.report(businessId),
        ]);
        if(r.status==='fulfilled')setRules(r.value?.items??[]);
        if(m.status==='fulfilled'){setMedia(m.value?.items??[]);setNextCursor(m.value?.nextCursor??null);}
        if(p.status==='fulfilled')setCatalog((p.value?.items??[]).filter(x=>x.active));
        if(a.status==='fulfilled')setReport(a.value);
      } else {setMedia([]);setRules([]);setReport(null);setCatalog([]);}
      setError('');
    } catch(e){setError(failure(e));}
    finally{setLoading(false);}
  },[businessId]);
  useEffect(()=>{void reload();},[reload]);

  const perform=async(fn)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{await fn();await reload();}
    catch(e){setError(failure(e));}
    finally{setBusy(false);}
  };
  const connect=()=>perform(async()=>{
    const started=await instagram.connect(businessId);
    if(!started?.authorizationUrl?.startsWith('https://www.instagram.com/oauth/authorize?'))
      throw new Error('Unsafe authorization URL');
    // OAuth requires the app callback. This is not the billing checkout flow.
    // eslint-disable-next-line no-restricted-properties
    await WebBrowser.openAuthSessionAsync(started.authorizationUrl,'storekit://instagram-complete');
  });
  const disconnect=()=>{
    Alert.alert('Disconnect Instagram?','Your rules will stop running. You can reconnect later.',[
      {text:'Cancel',style:'cancel'},
      {text:'Disconnect',style:'destructive',onPress:()=>void perform(()=>instagram.disconnect(businessId))}
    ]);
  };
  const createRule=()=>{
    if(!selectedMedia||!selectedProduct||!/^[A-Za-z0-9]{1,40}$/.test(keyword.trim())){
      setError('Select a post, an active product, and a keyword using letters or numbers.');
      return;
    }
    void perform(async()=>{
      await instagram.createRule(businessId,{mediaId:selectedMedia,productId:selectedProduct,
        keyword:keyword.trim(),active:false});
      setSelectedMedia('');setSelectedProduct('');
    });
  };
  const toggleRule=(rule)=>perform(()=>instagram.updateRule(businessId,rule.id,{active:!rule.active}));
  const deleteRule=(rule)=>Alert.alert('Delete rule?','This rule will no longer respond to comments.',[
    {text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',
      onPress:()=>void perform(()=>instagram.deleteRule(businessId,rule.id))}
  ]);
  const loadMore=()=>perform(async()=>{
    if(!nextCursor)return;
    const next=await instagram.media(businessId,nextCursor);
    setMedia((prev)=>[...prev,...(next?.items??[]).filter(item=>!prev.some(p=>p.id===item.id))]);
    setNextCursor(next?.nextCursor??null);
  });

  return <Card style={{marginBottom:space.xl}}>
    <Row gap={space.md} style={{marginBottom:space.md}}>
      <View style={{width:44,height:44,borderRadius:radius.sm,backgroundColor:'#e1306c',
        alignItems:'center',justifyContent:'center'}}>
        <Ionicons name="logo-instagram" color="#fff" size={24}/>
      </View>
      <View style={{flex:1}}>
        <Body strong>Instagram connection</Body>
        <Caption>Business and Creator accounts</Caption>
      </View>
    </Row>
    {loading?<ActivityIndicator color={colors.accent600}/>:<>
      <StatusLine status={status.status}/>
      {status.username?<Caption>@{status.username} · {status.accountType==='CREATOR'?'Creator':'Business'}</Caption>:null}
      {status.expiresAt?<Caption>Access expiry: {new Date(status.expiresAt).toLocaleDateString('en-IN')}</Caption>:null}
      {!status.enabled?<Caption>Instagram connection is disabled during development.</Caption>:null}
      {error?<Text accessibilityRole="alert" style={{...type.caption,color:colors.danger,marginVertical:space.md}}>{error}</Text>:null}
      {status.status==='disconnected'&&status.enabled?
        <Button title="Connect Instagram" disabled={busy} loading={busy} onPress={connect}/>:null}
      {status.status!=='disconnected'?<>
        {status.status==='connected'&&status.enabled?
          <Button title="Check connection" variant="secondary" disabled={busy}
            onPress={()=>perform(async()=>{setStatus(await instagram.check(businessId));})}/>:null}
        <View style={{height:space.sm}}/>
        <Button title="Disconnect Instagram" variant="danger" disabled={busy} onPress={disconnect}/>
      </>:null}
      {status.status==='disconnected'&&<Button title="Refresh status" variant="secondary" onPress={reload}/>}
      {status.status==='connected'&&status.enabled?<>
        <View style={{height:space.xl}}/>
        <Body strong>Auto-reply rules</Body>
        <Caption style={{marginBottom:space.md}}>Rules are saved as paused until you turn them on. Sending stays disabled until verification.</Caption>
        {rules.length===0?<Caption>No rules yet. Choose a post and product below.</Caption>:null}
        {rules.map(rule=><View key={rule.id}
          style={{paddingVertical:space.md,borderBottomWidth:1,borderColor:colors.line}}>
          <Body strong>{rule.keyword} · {rule.active?'Active':'Paused'}</Body>
          <Caption>Post {rule.mediaId} · Product {rule.productId}</Caption>
          <Row gap={space.sm} style={{marginTop:space.sm}}>
            <View style={{flex:1}}><Button title={rule.active?'Pause':'Activate'} size="sm"
              variant="secondary" disabled={busy} onPress={()=>toggleRule(rule)}/></View>
            <View style={{flex:1}}><Button title="Delete" size="sm" variant="danger"
              disabled={busy} onPress={()=>deleteRule(rule)}/></View>
          </Row>
        </View>)}
        <View style={{height:space.xl}}/>
        <Body strong>Create an automation</Body>
        <Caption>Select an Instagram post or Reel</Caption>
        {media.length===0?<Caption>No eligible posts found. Check your Instagram permissions and try again.</Caption>:null}
        {media.slice(0,20).map(m=><Choice key={m.id} chosen={m.id===selectedMedia} onPress={()=>setSelectedMedia(m.id)}
          image={m.thumbnailUrl} title={m.mediaProductType==='REELS'?'Reel':'Post'}
          subtitle={m.caption||m.publishedAt||m.id}/>)}
        {nextCursor?<Button title="Load more posts" variant="secondary" disabled={busy} onPress={loadMore}/>:null}
        <View style={{height:space.md}}/>
        <Caption>Choose an active product</Caption>
        {catalog.slice(0,50).map(p=><Choice key={p.productId} chosen={p.productId===selectedProduct}
          onPress={()=>setSelectedProduct(p.productId)} title={p.name??'Product'}
          subtitle={p.slug??p.productId}/>)}
        {catalog.length===0?<Caption>No active products found.</Caption>:null}
        <View style={{height:space.md}}/>
        <Caption>Comment keyword (example: LINK)</Caption>
        <TextInput value={keyword} onChangeText={setKeyword} autoCapitalize="characters"
          maxLength={40} placeholder="LINK" accessibilityLabel="Keyword"
          style={{borderColor:colors.line,borderWidth:1,borderRadius:radius.md,
            padding:space.md,color:colors.ink900,marginVertical:space.sm}}/>
        <Button title="Save paused rule" disabled={busy||!selectedMedia||!selectedProduct}
          loading={busy} onPress={createRule}/>
        {report?<View style={{marginTop:space.xl}}>
          <Body strong>Instagram activity</Body>
          <Caption>Processed comments: {report.commentsProcessed??0} · Replies sent: {report.repliesSent??0}</Caption>
          <Caption>Replies awaiting review: {report.repliesUncertain??0} · Tracked visits: {report.visits??0}</Caption>
          <Caption>Orders placed: {report.ordersPlaced??0} (not necessarily paid)</Caption>
        </View>:null}
      </>:null}
    </>}
  </Card>;
}
