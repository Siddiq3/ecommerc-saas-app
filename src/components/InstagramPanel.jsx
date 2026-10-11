import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Text, TextInput, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { instagram, products } from '../api/endpoints.js';
import { Body, Button, Caption, Card, Row, Touchable } from './ui.jsx';
import { colors, space, radius, type } from '../theme.js';

// Rules apply to one post or Reel, to every post (new ones included), or to direct messages.
const TARGETS = {
  ALL: { title: 'All posts and Reels', subtitle: 'Includes posts you add later' },
  DM: { title: 'Direct messages', subtitle: 'When a customer sends the keyword in a DM' },
};
const COMMENT_SCOPES = ['instagram_business_basic', 'instagram_business_manage_comments'];

const failure = (error) => {
  if (error?.code === 'INSTAGRAM_DISABLED') return 'Instagram connection is not enabled yet.';
  if (error?.code === 'INSTAGRAM_RECONNECT') return 'Instagram access expired. Disconnect and connect again.';
  if (error?.code === 'PLAN_LIMIT_EXCEEDED') return 'Your trial has ended. You can still disconnect or pause automations.';
  if (error?.code === 'INSTAGRAM_RULE_EXISTS') return 'There is already a rule for that keyword here.';
  if (error?.code === 'INSTAGRAM_PRODUCT_UNAVAILABLE') return 'Choose an active product.';
  if (error?.code === 'INSTAGRAM_CONFIRMATION_INVALID') return 'This Instagram connection request has expired. Please connect again.';
  if (error?.code === 'INSTAGRAM_CONNECT_FAILED') return 'Could not connect. This Instagram account may already be connected to another store.';
  if (error?.code === 'INSTAGRAM_MEDIA_UNAVAILABLE') return 'Choose one of your recent posts or Reels.';
  if (error?.code === 'INSTAGRAM_PERMISSIONS_MISSING') return 'Instagram did not allow comment access. Disconnect, connect again and allow all permissions.';
  if (error?.code === 'INSTAGRAM_WEBHOOK_NOT_READY') return 'Comment updates are not on yet. Tap "Check connection", then try again.';
  if (error?.code === 'INSTAGRAM_MESSAGES_NOT_READY') return 'Instagram did not allow message access. Disconnect, connect again and allow messages.';
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

export function InstagramPanel({ businessId, onEnabled }) {
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
      onEnabled?.(Boolean(current?.enabled));
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
  },[businessId,onEnabled]);
  useEffect(()=>{void reload();},[reload]);
  // Instagram login came back with a one-time code. Nothing is connected until this owner sees the account and agrees,
  // so a login link forwarded to someone else can never attach their Instagram to this store.
  const { igConfirm } = useLocalSearchParams();
  const handled=useRef(null);
  useEffect(()=>{
    if(!businessId||typeof igConfirm!=='string'||!/^[\w-]{43}$/.test(igConfirm)||handled.current===igConfirm)return;
    handled.current=igConfirm;
    router.setParams({igConfirm:undefined});
    void (async()=>{
      setBusy(true);setError('');
      try{
        const preview=await instagram.confirm(businessId,{confirmation:igConfirm,action:'preview'});
        const accepted=await new Promise((resolve)=>Alert.alert('Connect this Instagram account?',
          `@${preview?.username} (${preview?.accountType==='CREATOR'?'Creator':'Business'} account) will be connected to your store.`,
          [{text:'Cancel',style:'cancel',onPress:()=>resolve(false)},{text:'Connect',onPress:()=>resolve(true)}],
          {cancelable:false}));
        await instagram.confirm(businessId,{confirmation:igConfirm,action:accepted?'accept':'decline'});
        await reload();
      }catch(e){setError(failure(e));}
      finally{setBusy(false);}
    })();
  },[igConfirm,businessId,reload]);
  useEffect(()=>{
    const subscription=AppState.addEventListener('change',(state)=>{
      if(state==='active')void reload();
    });
    return()=>subscription.remove();
  },[reload]);

  const targetName=(id)=>TARGETS[id]?.title??(media.find(m=>m.id===id)?.caption?.slice(0,60)||'One post or Reel');
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
    // Instagram login opens externally and returns through the registered app link with a one-time code that only
    // this signed-in owner can confirm. This is not a purchase or subscription flow.
    await Linking.openURL(started.authorizationUrl);
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
      {status.expiresAt?<Caption>Access expiry: {new Date(status.expiresAt).toLocaleDateString('en-IN')} (renews automatically)</Caption>:null}
      {status.status==='connected'&&status.missingPermissions?.some(p=>COMMENT_SCOPES.includes(p))?
        <Caption style={{color:colors.warning}}>Comment access was not allowed. Disconnect, connect again and allow all permissions.</Caption>:null}
      {status.status==='connected'&&status.missingPermissions?.includes('instagram_business_manage_messages')?
        <Caption style={{color:colors.warning}}>Message access was not allowed, so DM replies are off. Disconnect and connect again to allow it.</Caption>:null}
      {status.status==='connected'&&status.enabled&&status.storePublished===false?
        <Caption style={{color:colors.warning}}>Publish your store to start sending replies. Customers only get links to a live store.</Caption>:null}
      {status.status==='connected'&&!status.missingPermissions?.some(p=>COMMENT_SCOPES.includes(p))&&status.webhook!=='subscribed'?
        <Caption style={{color:colors.warning}}>Comment updates are not on yet. Tap Check connection.</Caption>:null}
      {!status.enabled?<Caption>Instagram connection is disabled during development.</Caption>:null}
      {error?<Text accessibilityRole="alert" style={{...type.caption,color:colors.danger,marginVertical:space.md}}>{error}</Text>:null}
      {status.status==='disconnected'&&status.enabled?
        <Button title="Connect Instagram" disabled={busy} loading={busy} onPress={connect}/>:null}
      {status.status!=='disconnected'?<>
        {status.status==='connected'&&status.enabled?
          <Button title="Check connection" variant="secondary" disabled={busy}
            onPress={()=>perform(async()=>{const checked=await instagram.check(businessId);setStatus((prev)=>({...prev,...checked}));})}/>:null}
        <View style={{height:space.sm}}/>
        <Button title="Disconnect Instagram" variant="danger" disabled={busy} onPress={disconnect}/>
      </>:null}
      {status.status==='disconnected'&&<Button title="Refresh status" variant="secondary" onPress={reload}/>}
      {status.status==='connected'&&status.enabled?<>
        <View style={{height:space.xl}}/>
        <Body strong>Auto-reply rules</Body>
        <Caption style={{marginBottom:space.md}}>New rules are saved paused. Turn a rule on to start replying.</Caption>
        {rules.length===0?<Caption>No rules yet. Choose where to reply and a product below.</Caption>:null}
        {rules.map(rule=><View key={rule.id}
          style={{paddingVertical:space.md,borderBottomWidth:1,borderColor:colors.line}}>
          <Body strong>{rule.keyword} · {rule.active?'Active':'Paused'}</Body>
          <Caption numberOfLines={2}>{targetName(rule.mediaId)} · {catalog.find(p=>p.productId===rule.productId)?.name??'Product'}</Caption>
          <Row gap={space.sm} style={{marginTop:space.sm}}>
            <View style={{flex:1}}><Button title={rule.active?'Pause':'Activate'} size="sm"
              variant="secondary" disabled={busy} onPress={()=>toggleRule(rule)}/></View>
            <View style={{flex:1}}><Button title="Delete" size="sm" variant="danger"
              disabled={busy} onPress={()=>deleteRule(rule)}/></View>
          </Row>
        </View>)}
        <View style={{height:space.xl}}/>
        <Body strong>Create an automation</Body>
        <Caption>Where should we reply?</Caption>
        {Object.entries(TARGETS).map(([id,t])=><Choice key={id} chosen={id===selectedMedia}
          onPress={()=>setSelectedMedia(id)} title={t.title} subtitle={t.subtitle}/>)}
        <Caption>Or choose one post or Reel</Caption>
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
        <Caption>Keyword customers send (example: LINK or PRICE)</Caption>
        <TextInput value={keyword} onChangeText={setKeyword} autoCapitalize="characters"
          maxLength={40} placeholder="LINK" accessibilityLabel="Keyword"
          style={{borderColor:colors.line,borderWidth:1,borderRadius:radius.md,
            padding:space.md,color:colors.ink900,marginVertical:space.sm}}/>
        <Button title="Save paused rule" disabled={busy||!selectedMedia||!selectedProduct}
          loading={busy} onPress={createRule}/>
        {report?<View style={{marginTop:space.xl}}>
          <Body strong>Instagram activity</Body>
          <Caption>Comments and messages handled: {report.commentsProcessed??0} · Replies sent: {report.repliesSent??0}</Caption>
          <Caption>Replies awaiting review: {report.repliesUncertain??0} · Tracked visits: {report.visits??0}</Caption>
          <Caption>Orders placed: {report.ordersPlaced??0} (not necessarily paid)</Caption>
        </View>:null}
      </>:null}
    </>}
  </Card>;
}
